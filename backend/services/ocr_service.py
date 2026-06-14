import json
import os
import re

from mistralai.client import Mistral

from schemas import OcrItem

OCR_PROMPT = """Извлеки из скриншота мобильного приложения все пары «категория кэшбэка — процент».

Правила:
- Верни ТОЛЬКО валидный JSON-массив без markdown и пояснений
- Формат: [{"raw_category": "название", "rate": число}]
- rate — целое или дробное число процента (5 для «5%», 7.5 для «7,5%»)
- Если указано «до 5%» — возьми максимальное значение
- Игнорируй заголовки, даты, кнопки и декоративный текст
- Сохраняй оригинальные русские названия категорий как на скриншоте"""


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
            return _parse_ocr_json(json.dumps(parsed["items"]))
        if isinstance(parsed, list):
            return _parse_ocr_json(json.dumps(parsed))
        return _parse_ocr_json(content)
    except (json.JSONDecodeError, ValueError):
        return _parse_ocr_json(content)
