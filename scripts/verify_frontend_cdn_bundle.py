#!/usr/bin/env python3
"""Verify deployed Next.js bundle serves logos from Timeweb CDN, not direct S3.

Usage:
  python3 scripts/verify_frontend_cdn_bundle.py
  FRONTEND_URL=https://dev.cashbackbrain.ru python3 scripts/verify_frontend_cdn_bundle.py
"""
from __future__ import annotations

import os
import re
import sys
import urllib.error
import urllib.request

CDN_HOST = "1mh89t7nqb.cdn.twcstorage.ru"
S3_HOST = "fcdc8bee-4045-49ca-8869-3f22cd730eb5.s3.twcstorage.ru"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://cashbackbrain.ru").rstrip("/")
EXPECTED_CDN = os.environ.get("E2E_ASSETS_URL", f"https://{CDN_HOST}").rstrip("/")

CHUNK_RE = re.compile(r'/_next/static/chunks/[^"\']+\.js')


def fetch(url: str, timeout: int = 25) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "cashback-cdn-verify/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def find_logo_chunks(html: str) -> list[str]:
    chunks = CHUNK_RE.findall(html)
    logo_chunks: list[str] = []
    seen: set[str] = set()
    for chunk in chunks[:24]:
        try:
            body = fetch(f"{FRONTEND_URL}{chunk}")
        except (urllib.error.URLError, TimeoutError) as exc:
            print(f"  warn: skip {chunk}: {exc}")
            continue
        if "logos/banks" in body or "logos/markets" in body:
            if chunk not in seen:
                seen.add(chunk)
                logo_chunks.append(chunk)
    return logo_chunks


def analyze_chunk(body: str) -> tuple[bool, bool, list[str]]:
    has_cdn = CDN_HOST in body or EXPECTED_CDN in body
    has_s3 = S3_HOST in body
    urls = sorted(set(re.findall(r"https://[^\"'\\s]+twcstorage[^\"'\\s]*", body)))
    return has_cdn, has_s3, urls


def main() -> None:
    print("Frontend CDN bundle check")
    print(f"  URL:    {FRONTEND_URL}")
    print(f"  expect: {EXPECTED_CDN}")
    print()

    try:
        html = fetch(f"{FRONTEND_URL}/")
    except Exception as exc:
        print(f"FAIL: cannot load frontend: {exc}")
        sys.exit(1)

    if "dokploy" in html.lower() and "кэшб" not in html.lower():
        print("FAIL: frontend URL serves Dokploy panel, not the app")
        sys.exit(1)

    logo_chunks = find_logo_chunks(html)
    if not logo_chunks:
        print("FAIL: no JS chunk with logo catalog found")
        sys.exit(1)

    cdn_hits = 0
    s3_hits = 0
    sample_urls: list[str] = []

    for chunk in logo_chunks:
        body = fetch(f"{FRONTEND_URL}{chunk}")
        has_cdn, has_s3, urls = analyze_chunk(body)
        cdn_hits += int(has_cdn)
        s3_hits += int(has_s3)
        sample_urls.extend(urls)
        status = "CDN" if has_cdn and not has_s3 else ("S3" if has_s3 else "unknown")
        print(f"  chunk {chunk}: {status}")

    print()
    if sample_urls:
        print("  asset bases found:")
        for url in sorted(set(sample_urls))[:4]:
            print(f"    {url}")

    if s3_hits:
        print()
        print(f"FAIL: {s3_hits} chunk(s) still reference direct S3 ({S3_HOST})")
        sys.exit(1)

    if not cdn_hits:
        print()
        print(f"FAIL: logo chunks do not reference CDN ({CDN_HOST})")
        sys.exit(1)

    print()
    print(f"OK: frontend bundle uses CDN ({cdn_hits} logo chunk(s))")


if __name__ == "__main__":
    main()
