import base64
import json
import logging
import os
import re
import time
from io import BytesIO
from typing import Literal

import httpx
from mistralai.client import Mistral
from PIL import Image

from schemas import OcrItem
from services import catalog_store

logger = logging.getLogger(__name__)

DEFAULT_MISTRAL_TIMEOUT_SEC = 120.0
DEFAULT_OCR_MAX_IMAGE_DIMENSION = 1200
DEFAULT_OCR_JPEG_QUALITY = 80
OCR_MAX_ATTEMPTS = 2

OCR_PROMPT_BANK = """Извлеки из скриншота мобильного приложения пары «категория кэшбэка — процент».

Цель: только ОСНОВНЫЕ категории трат на месяц (типы покупок). Не партнёрские сервисы банка.

Правила формата:
- Верни ТОЛЬКО валидный JSON-массив без markdown и пояснений
- Формат: [{"raw_category": "название", "rate": число}]
- rate — целое или дробное число процента (5 для «5%», 7.5 для «7,5%»)
- Если указано «до 5%» у ОБЫЧНОЙ категории — возьми максимальное значение
- Сохраняй оригинальные русские названия категорий как на скриншоте (без процента в raw_category)
- НЕ выдумывай категории и проценты — извлекай только то, что явно видно
- Если на изображении НЕТ экрана кэшбэка банка — верни пустой массив []

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
- Не применяй обратную логику Ozon здесь — извлекай обычные категории кэшбэка, если они есть на скриншоте"""

OCR_PROMPT_MARKET = """Извлеки из скриншота мобильного приложения супермаркета пары «товарная категория кэшбэка — процент».

Правила формата:
- Верни ТОЛЬКО валидный JSON-массив без markdown и пояснений
- Формат: [{"raw_category": "название", "rate": число}]
- rate — целое или дробное число процента (10 для «10%», 7.5 для «7,5%»)
- Каждая строка списка кэшбэка — отдельная категория («Молоко», «Кисломолочка», «Твёрдые сыры»)
- НЕ выдумывай категории — только явно видимые строки
- Игнорируй промо-баннеры, заголовки, даты, кнопки
- Если на изображении НЕТ экрана кэшбэка супермаркета — верни []

Правила названия категории (raw_category):
- Бери ТОЛЬКО основной заголовок карточки/строки — крупный текст с названием товарной категории
- НЕ включай подписи, уточнения и мелкий текст под заголовком
- НЕ склеивай заголовок с подписью в одну строку
- Примеры: «Готовая кулинария» (НЕ «Готовая кулинария и на товары со скидкой»); «Пиво и сидр»; «Замороженные фрукты и ягоды»
- Игнорируй фразы про скидки и условия: «и на товары со скидкой», «на товары со скидкой», «кроме акций», «по карте», «до конца месяца» и подобное"""


def _normalize_category_name(name: str) -> str:
    return " ".join(name.lower().strip().split())


def _load_bank_service_patterns() -> list[str]:
    data = catalog_store.get("bank_service_exclusions")
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


def _finalize_ocr_items(items: list[OcrItem], kind: Literal["bank", "market"]) -> list[OcrItem]:
    if kind == "market":
        return items
    return filter_bank_services(items)


def _parse_response_content(content: str, kind: Literal["bank", "market"]) -> list[OcrItem]:
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict) and "items" in parsed:
            return _finalize_ocr_items(_parse_ocr_json(json.dumps(parsed["items"])), kind)
        if isinstance(parsed, list):
            return _finalize_ocr_items(_parse_ocr_json(json.dumps(parsed)), kind)
        return _finalize_ocr_items(_parse_ocr_json(content), kind)
    except (json.JSONDecodeError, ValueError):
        return _finalize_ocr_items(_parse_ocr_json(content), kind)


def _mistral_timeout_sec() -> float:
    try:
        return float(os.environ.get("MISTRAL_REQUEST_TIMEOUT_SEC", DEFAULT_MISTRAL_TIMEOUT_SEC))
    except ValueError:
        return DEFAULT_MISTRAL_TIMEOUT_SEC


def _ocr_max_image_dimension() -> int:
    try:
        return max(int(os.environ.get("OCR_MAX_IMAGE_DIMENSION", DEFAULT_OCR_MAX_IMAGE_DIMENSION)), 320)
    except ValueError:
        return DEFAULT_OCR_MAX_IMAGE_DIMENSION


def _ocr_jpeg_quality() -> int:
    try:
        return min(max(int(os.environ.get("OCR_JPEG_QUALITY", DEFAULT_OCR_JPEG_QUALITY)), 50), 95)
    except ValueError:
        return DEFAULT_OCR_JPEG_QUALITY


def _prepare_image_for_ocr(image_base64: str, mime_type: str) -> tuple[str, str]:
    """Downscale and recompress screenshots to keep Mistral uploads reliable."""
    raw = base64.b64decode(image_base64)
    with Image.open(BytesIO(raw)) as image:
        rgb = image.convert("RGB")
        width, height = rgb.size
        max_dim = _ocr_max_image_dimension()
        max_side = max(width, height)
        if max_side > max_dim:
            scale = max_dim / max_side
            rgb = rgb.resize(
                (max(1, int(width * scale)), max(1, int(height * scale))),
                Image.Resampling.LANCZOS,
            )

        output = BytesIO()
        rgb.save(output, format="JPEG", quality=_ocr_jpeg_quality(), optimize=True)
        prepared = output.getvalue()

    if len(prepared) < len(raw):
        logger.info(
            "OCR image prepared: %d KB -> %d KB (%dx%d)",
            len(raw) // 1024,
            len(prepared) // 1024,
            rgb.size[0],
            rgb.size[1],
        )

    return base64.b64encode(prepared).decode("ascii"), "image/jpeg"


def _is_transient_mistral_error(exc: BaseException) -> bool:
    if isinstance(
        exc,
        (
            httpx.TimeoutException,
            httpx.ConnectError,
            httpx.ReadError,
            httpx.RemoteProtocolError,
            httpx.WriteError,
        ),
    ):
        return True
    if isinstance(exc, OSError) and exc.errno in {60, 110}:
        return True
    message = str(exc).lower()
    return any(
        token in message
        for token in ("ssl", "eof", "timed out", "timeout", "connection reset", "broken pipe")
    )


def _get_mistral_client() -> Mistral:
    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        raise RuntimeError("MISTRAL_API_KEY is not configured")
    timeout = httpx.Timeout(_mistral_timeout_sec(), connect=30.0)
    return Mistral(
        api_key=api_key,
        client=httpx.Client(timeout=timeout, follow_redirects=True, http2=False),
    )


def _call_mistral_vision(client: Mistral, prompt: str, data_url: str) -> str:
    response = client.chat.complete(
        model=os.environ.get("MISTRAL_VISION_MODEL", "pixtral-12b-2409"),
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": data_url},
                ],
            }
        ],
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content or ""


def extract_cashback_items(
    image_base64: str,
    mime_type: str,
    kind: Literal["bank", "market"] = "bank",
) -> list[OcrItem]:
    prompt = OCR_PROMPT_MARKET if kind == "market" else OCR_PROMPT_BANK
    prepared_base64, prepared_mime = _prepare_image_for_ocr(image_base64, mime_type)
    data_url = f"data:{prepared_mime};base64,{prepared_base64}"

    last_error: Exception | None = None
    for attempt in range(1, OCR_MAX_ATTEMPTS + 1):
        try:
            content = _call_mistral_vision(_get_mistral_client(), prompt, data_url)
            if not content:
                return []
            return _parse_response_content(content, kind)
        except Exception as exc:
            last_error = exc
            if not _is_transient_mistral_error(exc) or attempt == OCR_MAX_ATTEMPTS:
                raise
            wait_sec = 2 ** (attempt - 1)
            logger.warning(
                "Mistral OCR attempt %d/%d failed (%s), retrying in %ss",
                attempt,
                OCR_MAX_ATTEMPTS,
                exc,
                wait_sec,
            )
            time.sleep(wait_sec)

    if last_error is not None:
        raise last_error
    return []
