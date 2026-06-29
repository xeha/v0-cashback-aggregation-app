"""OCR → map → quality gate → matrix merge orchestration."""

from __future__ import annotations

from fastapi import BackgroundTasks, HTTPException, Request

from schemas import (
    BankOfferItem,
    CategoryMapRequest,
    CategoryMapRequestItem,
    LowConfidenceItem,
    MappedItem,
    ProcessSubmissionRequest,
    ProcessSubmissionResponse,
)
from services.category_text_utils import sanitize_category
from services.mapper_service import MapperService
from services.market_split_map_service import MarketSplitMapService
from services.matrix_merge_service import create_provider_from_submission, merge_mapped_items
from services.ocr_service import extract_cashback_items
from services.retailer_resolver_service import RetailerResolverService

LOW_CONFIDENCE_THRESHOLD = 0.55

OCR_EMPTY_MESSAGE = "На скриншоте не найдены категории кешбэка."
OCR_UNRELIABLE_MESSAGE = (
    "Категории распознаны неуверенно — похоже, это не скриншот кешбэка. Выберите другое фото."
)


def is_unreliable_mapping(items: list[MappedItem]) -> bool:
    comparable = [item for item in items if not item.is_bank_offer]
    if not comparable:
        return False

    quality = [item for item in comparable if item.match_source != "reference_fallback"]
    if not quality:
        return False

    confidences = [item.confidence for item in quality]
    average = sum(confidences) / len(confidences)
    all_below = all(confidence < LOW_CONFIDENCE_THRESHOLD for confidence in confidences)
    mostly_fallback = (
        sum(1 for item in quality if item.unified_category == "Прочее") / len(quality) >= 0.5
    )
    return all_below or average < LOW_CONFIDENCE_THRESHOLD or mostly_fallback


def collect_low_confidence_items(
    items: list[MappedItem],
    provider_name: str,
) -> list[LowConfidenceItem]:
    return [
        LowConfidenceItem(
            provider_name=provider_name,
            raw_category=item.raw_category,
            unified_category=item.unified_category,
            confidence=item.confidence,
        )
        for item in items
        if not item.is_bank_offer and item.confidence < LOW_CONFIDENCE_THRESHOLD
    ]


def collect_bank_offer_items(
    items: list[MappedItem],
    provider_name: str,
) -> list[BankOfferItem]:
    return [
        BankOfferItem(
            provider_name=provider_name,
            raw_category=item.raw_category,
            unified_category=item.unified_category,
            rate=item.rate,
        )
        for item in items
        if item.is_bank_offer
    ]


def _get_bank_mapper(request: Request) -> MapperService:
    mapper: MapperService | None = getattr(request.app.state, "bank_mapper", None) or getattr(
        request.app.state, "mapper", None
    )
    if mapper is None or not mapper.is_loaded:
        raise HTTPException(status_code=503, detail="Bank category mapper is not ready")
    return mapper


def _get_market_mapper(request: Request) -> MarketSplitMapService:
    mapper: MarketSplitMapService | None = getattr(request.app.state, "market_mapper", None)
    if mapper is None or not mapper.is_loaded:
        raise HTTPException(status_code=503, detail="Market category mapper is not ready")
    return mapper


def _get_retailer_resolver(request: Request) -> RetailerResolverService | None:
    return getattr(request.app.state, "retailer_resolver", None)


def _map_categories(
    request: Request,
    body: ProcessSubmissionRequest,
    ocr_items: list[CategoryMapRequestItem],
    bg_tasks: BackgroundTasks,
) -> list[MappedItem]:
    if body.kind == "market":
        mapper = _get_market_mapper(request)
        prepared_items: list[CategoryMapRequestItem] = []
        normalized_keys: list[str] = []
        sanitized_meta = []
        for item in ocr_items:
            sanitized = sanitize_category(item.raw_category)
            prepared_items.append(
                CategoryMapRequestItem(raw_category=sanitized.display, rate=item.rate)
            )
            normalized_keys.append(sanitized.normalized_key)
            sanitized_meta.append(sanitized)
        items = mapper.map_items(prepared_items, body.provider_name, normalized_keys)
        for mapped, meta in zip(items, sanitized_meta):
            mapped.normalized_raw_category = meta.normalized_key
            mapped.normalize_source = meta.source
        return items

    mapper = _get_bank_mapper(request)
    items = mapper.map_items(ocr_items, body.provider_name)
    resolver = _get_retailer_resolver(request)
    if resolver:
        enrich_names = {item.raw_category for item in items if item.should_enrich_retailer}
        for name in enrich_names:
            bg_tasks.add_task(resolver.enrich_and_save, name)
    for item in items:
        item.should_enrich_retailer = False
    return items


def process_submission(
    body: ProcessSubmissionRequest,
    request: Request,
    bg_tasks: BackgroundTasks,
) -> ProcessSubmissionResponse:
    try:
        ocr_items = extract_cashback_items(body.image_base64, body.mime_type, body.kind)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OCR processing failed: {exc}") from exc

    if not ocr_items:
        raise HTTPException(status_code=422, detail=OCR_EMPTY_MESSAGE)

    map_request_items = [
        CategoryMapRequestItem(raw_category=item.raw_category, rate=item.rate) for item in ocr_items
    ]

    try:
        mapped_items = _map_categories(request, body, map_request_items, bg_tasks)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Category mapping failed: {exc}") from exc

    if is_unreliable_mapping(mapped_items):
        raise HTTPException(status_code=422, detail=OCR_UNRELIABLE_MESSAGE)

    current_matrix = body.current_matrix
    if current_matrix is not None and current_matrix.kind != body.kind:
        current_matrix = None

    existing_keys = (
        {provider.key for provider in current_matrix.providers} if current_matrix else set()
    )
    existing_providers = current_matrix.providers if current_matrix else []

    provider = create_provider_from_submission(
        provider_name=body.provider_name,
        provider_slug=body.provider_slug,
        existing_keys=existing_keys,
        existing_providers=existing_providers,
    )

    matrix = merge_mapped_items(current_matrix, provider, mapped_items, body.kind)

    return ProcessSubmissionResponse(
        matrix=matrix,
        low_confidence=collect_low_confidence_items(mapped_items, body.provider_name),
        bank_offers=collect_bank_offer_items(mapped_items, body.provider_name),
    )
