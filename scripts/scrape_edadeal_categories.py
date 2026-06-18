#!/usr/bin/env python3
"""Scrape L1/L2 category trees from edadeal.ru retailer pages via Selenium."""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RETAILERS = Path(
    "/Users/kseniya_agrova/obsidian/VIBECODING_Чуйков/sync_logos/rslp_pack/retailers.json"
)
ALIASES_PATH = ROOT / "backend" / "data" / "edadeal_slug_aliases.json"
RAW_PATH = ROOT / "backend" / "data" / "edadeal_categories_raw.json"
PARSED_PATH = ROOT / "backend" / "data" / "archive" / "parsed_market_taxonomies.json"

DISMISS_AGE_JS = r"""
const btns = [...document.querySelectorAll('button, a, span, div')];
const btn = btns.find(el => /Мне есть 18|Да\. Мне есть 18/.test(el.textContent || ''));
if (btn) btn.click();
"""

EXPAND_FOLDED_JS = r"""
document
  .querySelectorAll('.b-dsk-srch-cats-tree__node_level_0.b-dsk-srch-cats-tree__node_folded_true .b-dsk-srch-cats-tree__link')
  .forEach(el => el.click());
"""

EXTRACT_TREE_JS = r"""
const nodes = Array.from(document.querySelectorAll('.b-dsk-srch-cats-tree__node'));
let currentL1 = null;
const pairs = [];
const l1List = [];
for (const node of nodes) {
  const cls = node.className || '';
  const text = (node.querySelector('.b-dsk-srch-cats-tree__link-value') || {}).textContent?.trim();
  if (!text || text === 'Все') continue;
  const m = cls.match(/node_level_(\d+)/);
  const level = m ? parseInt(m[1], 10) : -1;
  if (level === 0) {
    currentL1 = text;
    l1List.push(text);
  } else if (level === 1 && currentL1) {
    pairs.push({ l1: currentL1, l2: text });
  }
}
return { l1: l1List, pairs };
"""


def _load_json(path: Path, default: dict | list) -> dict | list:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def _save_json(path: Path, data: dict | list) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _catalog_key(edadeal_slug: str, aliases: dict[str, str]) -> str:
    return aliases.get(edadeal_slug, edadeal_slug)


def _build_parsed(raw: dict[str, dict], aliases: dict[str, str]) -> dict[str, list[dict[str, str]]]:
    parsed: dict[str, list[dict[str, str]]] = {}
    seen: dict[str, set[tuple[str, str]]] = {}

    for entry in raw.values():
        if entry.get("error"):
            continue
        catalog_key = entry.get("catalog_key") or _catalog_key(entry["edadeal_slug"], aliases)
        seen.setdefault(catalog_key, set())
        parsed.setdefault(catalog_key, [])
        for pair in entry.get("pairs", []):
            key = (pair["l1"], pair["l2"])
            if key in seen[catalog_key]:
                continue
            seen[catalog_key].add(key)
            parsed[catalog_key].append(pair)
    return parsed


def _create_driver() -> webdriver.Chrome:
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1920,1080")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_argument(
        "user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    driver = webdriver.Chrome(options=opts)
    driver.set_script_timeout(60)
    driver.set_page_load_timeout(45)
    return driver


def _scrape_retailer(
    driver: webdriver.Chrome,
    *,
    edadeal_slug: str,
    retailer_name: str,
    city: str,
    wait_seconds: float,
) -> dict:
    url = f"https://edadeal.ru/{city}/retailers/{edadeal_slug}"
    driver.get(url)
    WebDriverWait(driver, 30).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, ".b-dsk-srch-cats-tree__cell"))
    )
    time.sleep(wait_seconds)
    driver.execute_script(DISMISS_AGE_JS)
    time.sleep(0.4)
    driver.execute_script(EXPAND_FOLDED_JS)
    time.sleep(0.4)
    tree = driver.execute_script(EXTRACT_TREE_JS)
    return {
        "edadeal_slug": edadeal_slug,
        "retailer_name": retailer_name,
        "url": url,
        "scraped_at": datetime.now(UTC).isoformat(),
        "l1": tree["l1"],
        "pairs": tree["pairs"],
        "l1_count": len(tree["l1"]),
        "l2_count": len(tree["pairs"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape edadeal.ru retailer category trees")
    parser.add_argument("--retailers", type=Path, default=DEFAULT_RETAILERS)
    parser.add_argument("--city", default="moskva")
    parser.add_argument("--sleep", type=float, default=1.5, help="Pause between retailers")
    parser.add_argument("--wait", type=float, default=2.0, help="Wait after page load")
    parser.add_argument("--limit", type=int, default=0, help="Max retailers (0 = all)")
    parser.add_argument("--resume", action="store_true", help="Skip slugs already in raw output")
    parser.add_argument("--slug", action="append", default=[], help="Scrape only these slugs")
    args = parser.parse_args()

    if not args.retailers.exists():
        print(f"Retailers file not found: {args.retailers}", file=sys.stderr)
        return 1

    retailers: list[dict] = json.loads(args.retailers.read_text(encoding="utf-8"))
    aliases: dict[str, str] = _load_json(ALIASES_PATH, {})
    raw: dict[str, dict] = _load_json(RAW_PATH, {})

    if args.slug:
        slug_set = set(args.slug)
        retailers = [r for r in retailers if r["slug"] in slug_set]
    if args.limit > 0:
        retailers = retailers[: args.limit]

    pending = []
    for retailer in retailers:
        slug = retailer["slug"]
        if args.resume and slug in raw and not raw[slug].get("error"):
            continue
        pending.append(retailer)

    print(f"Retailers total: {len(retailers)}, pending: {len(pending)}")
    if not pending:
        parsed = _build_parsed(raw, aliases)
        for entry in raw.values():
            entry["catalog_key"] = _catalog_key(entry["edadeal_slug"], aliases)
        _save_json(RAW_PATH, raw)
        _save_json(PARSED_PATH, parsed)
        print(f"Nothing to scrape. Parsed keys: {len(parsed)}")
        return 0

    driver = _create_driver()
    ok = 0
    failed = 0

    try:
        for idx, retailer in enumerate(pending, start=1):
            slug = retailer["slug"]
            name = retailer.get("name", slug)
            catalog_key = _catalog_key(slug, aliases)
            print(f"[{idx}/{len(pending)}] {slug} -> {catalog_key} ... ", end="", flush=True)
            try:
                entry = _scrape_retailer(
                    driver,
                    edadeal_slug=slug,
                    retailer_name=name,
                    city=args.city,
                    wait_seconds=args.wait,
                )
                entry["catalog_key"] = catalog_key
                raw[slug] = entry
                ok += 1
                print(f"OK L1={entry['l1_count']} L2={entry['l2_count']}")
            except (TimeoutException, WebDriverException) as exc:
                failed += 1
                raw[slug] = {
                    "edadeal_slug": slug,
                    "catalog_key": catalog_key,
                    "retailer_name": name,
                    "url": f"https://edadeal.ru/{args.city}/retailers/{slug}",
                    "scraped_at": datetime.now(UTC).isoformat(),
                    "error": str(exc),
                    "l1": [],
                    "pairs": [],
                    "l1_count": 0,
                    "l2_count": 0,
                }
                print(f"FAIL: {exc}")
            _save_json(RAW_PATH, raw)
            if idx < len(pending):
                time.sleep(args.sleep)
    finally:
        driver.quit()

    for entry in raw.values():
        entry["catalog_key"] = _catalog_key(entry["edadeal_slug"], aliases)
    parsed = _build_parsed(raw, aliases)
    _save_json(RAW_PATH, raw)
    _save_json(PARSED_PATH, parsed)

    print(f"\nDone: ok={ok}, failed={failed}")
    print(f"Raw: {RAW_PATH} ({len(raw)} slugs)")
    print(f"Parsed: {PARSED_PATH} ({len(parsed)} catalog keys, {sum(len(v) for v in parsed.values())} pairs)")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
