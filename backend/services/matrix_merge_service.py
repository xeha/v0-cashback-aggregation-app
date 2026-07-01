"""Port of lib/matrix.ts merge logic for server-side pipeline."""

from __future__ import annotations

import re
from schemas import CashbackMatrix, ComparisonPart, MappedItem, MatrixProvider, MatrixRow, ReferencePathNode
from services.category_label import format_category_label, labels_equivalent, normalize_category_label

Kind = str


def _slugify(name: str) -> str:
    slug = (
        re.sub(r"[^a-zа-яё0-9]+", "-", name.lower().strip(), flags=re.IGNORECASE)
        .strip("-")[:40]
    )
    return slug or "provider"


def build_provider_key(name: str, existing_keys: set[str]) -> str:
    base = _slugify(name)
    key = base
    counter = 2
    while key in existing_keys:
        key = f"{base}-{counter}"
        counter += 1
    return key


def _normalize_provider_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def provider_names_match(a: str, b: str) -> bool:
    key_a = _normalize_provider_name(a)
    key_b = _normalize_provider_name(b)
    return bool(key_a and key_b and key_a == key_b)


def find_matching_provider(
    provider_name: str,
    provider_slug: str | None,
    providers: list[MatrixProvider],
) -> MatrixProvider | None:
    for provider in providers:
        if provider_slug and provider.slug and provider.slug == provider_slug:
            return provider
        if provider_names_match(provider_name, provider.name):
            return provider
    return None


def create_provider_from_submission(
    *,
    provider_name: str,
    provider_slug: str | None,
    existing_keys: set[str],
    existing_providers: list[MatrixProvider],
) -> MatrixProvider:
    existing = find_matching_provider(provider_name, provider_slug, existing_providers)
    if existing:
        return existing

    name = provider_name.strip()
    key = build_provider_key(name, existing_keys)
    return MatrixProvider(key=key, name=name, slug=provider_slug)


def _resolve_bank_row_key(
    is_macro: bool,
    parent: str | None,
    canonical_label: str,
) -> str:
    if is_macro and parent:
        return f"macro::{normalize_category_label(parent)}"
    return f"leaf::{normalize_category_label(canonical_label)}"


def _row_key_from_existing(row: MatrixRow) -> str:
    if row.is_macro and row.parent:
        return f"macro::{normalize_category_label(row.parent)}"
    canonical = row.canonical_category or row.category
    return f"leaf::{normalize_category_label(canonical)}"


def _resolve_bank_display_label(item: MappedItem, canonical: str, is_macro: bool) -> str:
    parent = item.unified_parent
    if is_macro and parent:
        if item.unified_category and not labels_equivalent(item.unified_category, canonical):
            return item.unified_category
        return parent
    if item.unified_category and not labels_equivalent(item.unified_category, canonical):
        return item.unified_category
    return canonical


def merge_mapped_items(
    matrix: CashbackMatrix | None,
    provider: MatrixProvider,
    items: list[MappedItem],
    kind: Kind,
) -> CashbackMatrix:
    row_map: dict[str, MatrixRow] = {}
    collected_market_parts: list[ComparisonPart] = (
        list(matrix.market_parts) if matrix and matrix.kind == kind and matrix.market_parts else []
    )

    if matrix and matrix.kind == kind:
        for row in matrix.rows:
            key = _row_key_from_existing(row)
            row_map[key] = row.model_copy(deep=True)
            row_map[key].rates = dict(row.rates)

    for item in items:
        if item.is_bank_offer:
            continue

        if kind == "market":
            path = item.reference_path or []
            if not path:
                continue
            collected_market_parts.append(
                ComparisonPart(
                    store=provider.key,
                    rate=item.rate,
                    label=format_category_label(
                        item.split_text or item.display_label or item.unified_category
                    ),
                    node_id=item.reference_node_id or path[-1].id,
                    path=[ReferencePathNode(id=node.id, name=node.name) for node in path],
                )
            )
            continue

        is_macro = item.is_macro_category
        parent = item.unified_parent
        canonical = item.unified_subcategory or item.unified_category
        display_label = _resolve_bank_display_label(item, canonical, is_macro)
        display_category = format_category_label(display_label)
        raw = item.raw_category.strip()
        bank_raw = (
            raw
            if raw
            and not labels_equivalent(raw, display_category)
            and not labels_equivalent(raw, canonical)
            else None
        )
        row_key = _resolve_bank_row_key(
            is_macro,
            parent,
            parent if is_macro and parent else canonical,
        )

        existing = row_map.get(row_key)
        if existing is None:
            existing = MatrixRow(
                category=display_category,
                canonical_category=(
                    canonical
                    if not is_macro and not labels_equivalent(display_category, canonical)
                    else None
                ),
                parent=parent,
                bank_raw=bank_raw,
                is_macro=is_macro,
                rates={},
            )
        had_providers = len(existing.rates) > 0
        existing.rates[provider.key] = item.rate
        if not existing.parent and parent:
            existing.parent = parent
        if not existing.is_macro and is_macro:
            existing.is_macro = is_macro

        if not is_macro and had_providers and existing.canonical_category:
            existing.category = format_category_label(existing.canonical_category)
            existing.bank_raw = None
        elif not had_providers:
            existing.category = display_category
            if not is_macro and not labels_equivalent(display_category, canonical):
                existing.canonical_category = canonical
            if bank_raw:
                existing.bank_raw = bank_raw
        elif had_providers and is_macro:
            existing.bank_raw = None

        row_map[row_key] = existing

        if is_macro and parent and bank_raw:
            retailer_key = f"leaf::{normalize_category_label(bank_raw)}"
            retailer_row = row_map.get(retailer_key)
            if retailer_row is None:
                retailer_row = MatrixRow(
                    category=format_category_label(bank_raw),
                    parent=parent,
                    is_macro=False,
                    rates={},
                )
            retailer_row.rates[provider.key] = item.rate
            if not retailer_row.parent:
                retailer_row.parent = parent
            row_map[retailer_key] = retailer_row

    if matrix and matrix.kind == kind:
        providers = [p for p in matrix.providers if p.key != provider.key] + [provider]
    else:
        providers = [provider]

    rows = sorted(row_map.values(), key=lambda row: row.category)

    return CashbackMatrix(
        kind=kind,  # type: ignore[arg-type]
        providers=providers,
        rows=rows,
        market_parts=collected_market_parts if kind == "market" else None,
    )
