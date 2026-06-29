#!/usr/bin/env python3
"""Compare legacy (OCR + map + merge) vs pipeline (/api/pipeline/process) on real screenshots."""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import sys
from pathlib import Path
from typing import Any

import httpx

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from schemas import CashbackMatrix, CategoryMapRequestItem, MappedItem, MatrixProvider, ProcessSubmissionRequest
from services.matrix_merge_service import create_provider_from_submission, merge_mapped_items

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"}


def load_image_payload(path: Path) -> tuple[str, str]:
    mime, _ = mimetypes.guess_type(path.name)
    mime_type = mime or "image/jpeg"
    if mime_type == "image/jpg":
        mime_type = "image/jpeg"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return data, mime_type


def matrix_to_comparable(matrix: CashbackMatrix) -> dict[str, Any]:
    return json.loads(matrix.model_dump_json())


def legacy_path(
    client: httpx.Client,
    *,
    image_base64: str,
    mime_type: str,
    kind: str,
    provider_name: str,
    provider_slug: str | None,
) -> CashbackMatrix:
    ocr = client.post(
        "/api/ocr/extract",
        json={"image_base64": image_base64, "mime_type": mime_type, "kind": kind},
        timeout=180.0,
    )
    ocr.raise_for_status()
    items = ocr.json().get("items") or []
    if not items:
        raise ValueError("OCR returned no items")

    mapped = client.post(
        "/api/category/map",
        json={
            "items": items,
            "source_name": provider_name,
            "kind": kind,
            "source_slug": provider_slug,
        },
        timeout=120.0,
    )
    mapped.raise_for_status()
    mapped_items = [MappedItem.model_validate(item) for item in mapped.json().get("items") or []]

    provider = create_provider_from_submission(
        provider_name=provider_name,
        provider_slug=provider_slug,
        existing_keys=set(),
        existing_providers=[],
    )
    return merge_mapped_items(None, provider, mapped_items, kind)


def pipeline_path(
    client: httpx.Client,
    *,
    image_base64: str,
    mime_type: str,
    kind: str,
    provider_name: str,
    provider_slug: str | None,
) -> CashbackMatrix:
    response = client.post(
        "/api/pipeline/process",
        json=ProcessSubmissionRequest(
            image_base64=image_base64,
            mime_type=mime_type,  # type: ignore[arg-type]
            kind=kind,  # type: ignore[arg-type]
            provider_name=provider_name,
            provider_slug=provider_slug,
        ).model_dump(),
        timeout=180.0,
    )
    response.raise_for_status()
    payload = response.json()
    return CashbackMatrix.model_validate(payload["matrix"])


def diff_matrices(legacy: dict[str, Any], pipeline: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if legacy.get("kind") != pipeline.get("kind"):
        issues.append(f"kind: {legacy.get('kind')} != {pipeline.get('kind')}")

    legacy_providers = {p["key"]: p for p in legacy.get("providers", [])}
    pipeline_providers = {p["key"]: p for p in pipeline.get("providers", [])}
    if set(legacy_providers) != set(pipeline_providers):
        issues.append(f"provider keys: {set(legacy_providers)} != {set(pipeline_providers)}")
    for key in set(legacy_providers) & set(pipeline_providers):
        if legacy_providers[key].get("name") != pipeline_providers[key].get("name"):
            issues.append(f"provider {key} name mismatch")

    def row_key(row: dict[str, Any]) -> str:
        parent = row.get("parent") or ""
        cat = row.get("canonical_category") or row.get("category") or ""
        macro = row.get("is_macro")
        return f"{parent}::{cat}::{macro}"

    legacy_rows = {row_key(r): r for r in legacy.get("rows", [])}
    pipeline_rows = {row_key(r): r for r in pipeline.get("rows", [])}
    if set(legacy_rows) != set(pipeline_rows):
        only_legacy = set(legacy_rows) - set(pipeline_rows)
        only_pipeline = set(pipeline_rows) - set(legacy_rows)
        if only_legacy:
            issues.append(f"rows only in legacy: {sorted(only_legacy)[:5]}")
        if only_pipeline:
            issues.append(f"rows only in pipeline: {sorted(only_pipeline)[:5]}")

    for key in set(legacy_rows) & set(pipeline_rows):
        lr, pr = legacy_rows[key], pipeline_rows[key]
        if lr.get("rates") != pr.get("rates"):
            issues.append(f"rates mismatch for {key}: {lr.get('rates')} vs {pr.get('rates')}")

    legacy_parts = legacy.get("market_parts") or []
    pipeline_parts = pipeline.get("market_parts") or []
    if len(legacy_parts) != len(pipeline_parts):
        issues.append(f"market_parts count: {len(legacy_parts)} != {len(pipeline_parts)}")

    return issues


def parse_manifest(manifest_path: Path) -> dict[str, dict[str, str]]:
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("manifest must be a JSON object")
    return data


def resolve_case(
    path: Path,
    manifest: dict[str, dict[str, str]] | None,
    default_kind: str,
    default_provider: str,
    subfolder_provider: str | None = None,
) -> tuple[str, str, str | None]:
    entry = (manifest or {}).get(path.name) or (manifest or {}).get(path.stem)
    kind = (entry or {}).get("kind", default_kind)
    provider_name = (
        (entry or {}).get("provider_name")
        or (entry or {}).get("provider")
        or subfolder_provider
        or default_provider
    )
    provider_slug = (entry or {}).get("provider_slug") or (entry or {}).get("slug")
    return kind, provider_name, provider_slug


def collect_images(folder: Path, walk_subdirs: bool) -> list[tuple[Path, str | None]]:
    """Return (image_path, subfolder_provider_name)."""
    if not walk_subdirs:
        return [
            (p, None)
            for p in sorted(folder.iterdir())
            if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
        ]

    collected: list[tuple[Path, str | None]] = []
    for child in sorted(folder.iterdir()):
        if child.is_file() and child.suffix.lower() in IMAGE_EXTENSIONS:
            collected.append((child, None))
            continue
        if not child.is_dir():
            continue
        provider_hint = child.name.replace("_", " ").replace("-", " ").strip()
        for image in sorted(child.rglob("*")):
            if image.is_file() and image.suffix.lower() in IMAGE_EXTENSIONS:
                collected.append((image, provider_hint))
    return collected


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("screenshots_dir", type=Path, help="Folder with screenshot images")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--kind", default="bank", choices=["bank", "market"])
    parser.add_argument("--provider", default="Тестовый банк", help="Default provider name")
    parser.add_argument("--manifest", type=Path, help="JSON map: filename -> {kind, provider_name, provider_slug}")
    parser.add_argument("--walk-subdirs", action="store_true", help="Use subfolder names as provider_name")
    parser.add_argument("--output", type=Path, help="Write full comparison JSON here")
    args = parser.parse_args()

    folder = args.screenshots_dir.expanduser().resolve()
    if not folder.is_dir():
        print(f"Not a directory: {folder}", file=sys.stderr)
        return 1

    manifest = parse_manifest(args.manifest) if args.manifest else None
    images = collect_images(folder, args.walk_subdirs)
    if not images:
        print(f"No images found in {folder}", file=sys.stderr)
        return 1

    health = httpx.get(f"{args.base_url.rstrip('/')}/health", timeout=10.0)
    health.raise_for_status()
    if not health.json().get("mapper_loaded"):
        print("Warning: bank mapper not loaded yet — first request may be slow", file=sys.stderr)

    results: list[dict[str, Any]] = []
    failed = 0

    with httpx.Client(base_url=args.base_url.rstrip("/")) as client:
        for image_path, subfolder_provider in images:
            kind, provider_name, provider_slug = resolve_case(
                image_path, manifest, args.kind, args.provider, subfolder_provider
            )
            label = str(image_path.relative_to(folder))
            print(f"\n=== {label} ({kind}, {provider_name}) ===")
            record: dict[str, Any] = {
                "file": label,
                "kind": kind,
                "provider_name": provider_name,
                "provider_slug": provider_slug,
            }
            try:
                image_base64, mime_type = load_image_payload(image_path)
                legacy_matrix = legacy_path(
                    client,
                    image_base64=image_base64,
                    mime_type=mime_type,
                    kind=kind,
                    provider_name=provider_name,
                    provider_slug=provider_slug,
                )
                pipeline_matrix = pipeline_path(
                    client,
                    image_base64=image_base64,
                    mime_type=mime_type,
                    kind=kind,
                    provider_name=provider_name,
                    provider_slug=provider_slug,
                )
                legacy_cmp = matrix_to_comparable(legacy_matrix)
                pipeline_cmp = matrix_to_comparable(pipeline_matrix)
                issues = diff_matrices(legacy_cmp, pipeline_cmp)
                record["match"] = len(issues) == 0
                record["issues"] = issues
                record["legacy_rows"] = len(legacy_cmp.get("rows", []))
                record["pipeline_rows"] = len(pipeline_cmp.get("rows", []))
                if issues:
                    failed += 1
                    print("MISMATCH:")
                    for issue in issues:
                        print(f"  - {issue}")
                else:
                    print(f"OK — {record['legacy_rows']} rows match")
            except httpx.HTTPStatusError as exc:
                failed += 1
                detail = exc.response.text[:300]
                record["error"] = f"HTTP {exc.response.status_code}: {detail}"
                print(f"ERROR: {record['error']}")
            except Exception as exc:
                failed += 1
                record["error"] = str(exc)
                print(f"ERROR: {exc}")

            results.append(record)

    summary = {
        "total": len(images),
        "matched": len(images) - failed,
        "failed": failed,
        "results": results,
    }
    print(f"\n--- Summary: {summary['matched']}/{summary['total']} matched ---")

    if args.output:
        args.output.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote {args.output}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
