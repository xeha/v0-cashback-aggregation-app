import json
import os
import re
from pathlib import Path

from mistralai.client import Mistral

from schemas import OcrItem

EXCLUSIONS_PATH = Path(__file__).resolve().parent.parent / "data" / "bank_service_exclusions.json"

OCR_PROMPT = """Извлеки из скриншота мобильного приложения пары «категория кэшбэка — процент».

Цель: только ОСНОВНЫЕ категории трат на месяц (типы покупок). Не партнёрские сервисы банка.

Правила формата:
- Верни ТОЛЬКО валидный JSON-массив без markdown и пояснений
- Формат: [{"raw_category": "название", "rate": число}]
- rate — целое или дробное число процента (5 для «5%», 7.5 для «7,5%»)
- Если указано «до 5%» у ОБЫЧНОЙ категории — возьми максимальное значение
- Сохраняй оригинальные русские названия категорий как на скриншоте (без процента в raw_category)
- НЕ выдумывай категории и проценты — извлекай только то, что явно видно
- Если на изображении НЕТ экрана кэшбэка банка или магазина — верни пустой массив []

Что ИГНОРИРОВАТЬ (не включать в JSON):
- Промо-баннеры, заголовки экрана, даты, кнопки, иконки «i»
- Заголовки секций: «Сервисы банка», «Сервисы Альфа-Банка», «Партнёры», «В приложении» и т.п.
- Подписи под строкой категории («Для зарплатных клиентов», «С Альфа-Смарт», «по подписке») — не добавляй в raw_category
- ВСЕ строки внутренних сервисов экосистемы банка (см. список ниже), даже если указан процент

СЕРВИСЫ БАНКА — НЕ ИЗВЛЕКАТЬ (оверрайды экосистемы):

Альфа-Банк:
- Альфа Тревел, Тревел, «Отели в Тревел», «Авиа в Тревел», ж/д через Тревел
- Альфа Заправки, Альфа-Заправки, Заправки (раздел банка)
- Альфа-Афиша, Афиша (раздел банка)

Т-Банк (Тинькофф):
- Т-Город, Шопинг в Городе, Доставка в Городе, Доставка еды в Городе
- Т-Путешествия, Путешествия в Городе (собственный тревел-раздел)
- Топливо в Городе, Авто в Городе, автосервисы через Город

Сбер:
- СберТревел, СпасибоТревел, Сбер Путешествия
- Мегамаркет (маркетплейс Сбера)
- Самокат, Купер, Еаптека (доставка экосистемы)
- СберАвтопоиск, авиа через партнёров Сбера (как отдельная строка сервиса)

ВТБ:
- ВТБ Шопинг, Шопинг ВТБ
- ВТБ Путешествия

Яндекс Банк:
- Строки «Сервисы Яндекса», «Экосистема Яндекса», повышенный кэшбэк только внутри Яндекс-сервисов (как отдельный блок)

МТС Банк:
- Мой МТС, MTS Premium, оплата связи через приложение МТС (как сервисная строка)

Газпромбанк:
- Газпромбанк Travel, Travel Газпромбанка

Почта Банк:
- «Супермаркеты + Почта» как единая сервисная строка; отделения Почты России как партнёрский блок

Ozon Банк:
- Не применяй обратную логику Ozon здесь — извлекай обычные категории кэшбэка, если они есть на скриншоте

Супермаркеты (Магнит, Пятёрочка, Лента и т.п.):
- Категории часто товарные: «Молоко», «Твёрдые сыры», «Кисломолочка» — извлекай каждую строку списка отдельно
- Подписи вроде «Даже по акции» включай в raw_category только если они напечатаны как часть названия категории"""


def _normalize_category_name(name: str) -> str:
    return " ".join(name.lower().strip().split())


def _load_bank_service_patterns() -> list[str]:
    with EXCLUSIONS_PATH.open(encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("bank_service_exclusions.json must be a JSON array")
    return [str(entry).strip().lower() for entry in data if str(entry).strip()]


def _is_bank_service_category(raw_category: str, patterns: list[str]) -> bool:
    normalized = _normalize_category_name(raw_category)
    if not normalized:
        return True
    return any(pattern in normalized for pattern in patterns)


def filter_bank_services(items: list[OcrItem]) -> list[OcrItem]:
    patterns = _load_bank_service_patterns()
    return [
        item
        for item in items
        if not _is_bank_service_category(item.raw_category, patterns)
    ]


def _parse_ocr_json(text: str) -> list[OcrItem]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    data = json.loads(cleaned)
    if not isinstance(data, list):
        raise ValueError("OCR response must be a JSON array")

    items: list[OcrItem] = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        raw = str(entry.get("raw_category", "")).strip()
        rate = entry.get("rate")
        if not raw or rate is None:
            continue
        items.append(OcrItem(raw_category=raw, rate=float(rate)))
    return items


def _parse_and_filter_ocr_json(text: str) -> list[OcrItem]:
    return filter_bank_services(_parse_ocr_json(text))


def extract_cashback_items(image_base64: str, mime_type: str) -> list[OcrItem]:
    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        raise RuntimeError("MISTRAL_API_KEY is not configured")

    client = Mistral(api_key=api_key)
    normalized_mime = "image/jpeg" if mime_type == "image/jpg" else mime_type
    data_url = f"data:{normalized_mime};base64,{image_base64}"

    response = client.chat.complete(
        model=os.environ.get("MISTRAL_VISION_MODEL", "pixtral-12b-2409"),
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": OCR_PROMPT},
                    {"type": "image_url", "image_url": data_url},
                ],
            }
        ],
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    if not content:
        return []

    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict) and "items" in parsed:
            return _parse_and_filter_ocr_json(json.dumps(parsed["items"]))
        if isinstance(parsed, list):
            return _parse_and_filter_ocr_json(json.dumps(parsed))
        return _parse_and_filter_ocr_json(content)
    except (json.JSONDecodeError, ValueError):
        return _parse_and_filter_ocr_json(content)
