"""Mirror of lib/category-label.ts for matrix merge on the server."""

import re


def normalize_category_label(name: str) -> str:
    return re.sub(r"\s+", " ", name.lower()).strip()


def format_category_label(name: str) -> str:
    words = name.split()
    result: list[str] = []
    for index, word in enumerate(words):
        if word.lower() == "и" and index > 0:
            result.append("и")
            continue
        if re.fullmatch(r"\(.+\)", word):
            result.append(word)
            continue
        lower = word.lower()
        result.append(lower[0].upper() + lower[1:] if lower else word)
    return " ".join(result)


def labels_equivalent(a: str, b: str) -> bool:
    return normalize_category_label(a) == normalize_category_label(b)
