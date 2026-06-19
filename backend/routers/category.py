from fastapi import APIRouter, HTTPException, Request

from schemas import CategoryMapRequest, CategoryMapRequestItem, CategoryMapResponse
from services.category_compound_split_service import CategoryCompoundSplitService
from services.category_text_utils import sanitize_category
from services.mapper_service import MapperService
from services.reference_mapper_service import ReferenceMapperService

router = APIRouter(prefix="/api/category", tags=["category"])


def _get_bank_mapper(request: Request) -> MapperService:
    mapper: MapperService | None = getattr(request.app.state, "bank_mapper", None) or getattr(
        request.app.state, "mapper", None
    )
    if mapper is None or not mapper.is_loaded:
        raise HTTPException(status_code=503, detail="Bank category mapper is not ready")
    return mapper


def _get_reference_mapper(request: Request) -> ReferenceMapperService:
    mapper: ReferenceMapperService | None = getattr(request.app.state, "reference_mapper", None)
    if mapper is None or not mapper.is_loaded:
        raise HTTPException(status_code=503, detail="Reference category mapper is not ready")
    return mapper


def _get_category_compound_splitter(request: Request) -> CategoryCompoundSplitService:
    splitter: CategoryCompoundSplitService | None = getattr(
        request.app.state, "category_compound_splitter", None
    )
    if splitter is None or not splitter.is_loaded:
        raise HTTPException(status_code=503, detail="Category compound splitter is not ready")
    return splitter


@router.post("/map", response_model=CategoryMapResponse)
def category_map(body: CategoryMapRequest, request: Request) -> CategoryMapResponse:
    try:
        if body.kind == "market":
            mapper = _get_reference_mapper(request)
            splitter = _get_category_compound_splitter(request)
            expanded_items = splitter.expand_compound_items(body.items)
            prepared_items: list[CategoryMapRequestItem] = []
            normalized_keys: list[str] = []
            sanitized_meta = []
            for item in expanded_items:
                sanitized = sanitize_category(item.raw_category)
                prepared_items.append(
                    CategoryMapRequestItem(raw_category=sanitized.display, rate=item.rate)
                )
                normalized_keys.append(sanitized.normalized_key)
                sanitized_meta.append(sanitized)
            items = mapper.map_items(
                prepared_items,
                body.source_name,
                normalized_keys,
            )
            for mapped, meta in zip(items, sanitized_meta):
                mapped.normalized_raw_category = meta.normalized_key
                mapped.normalize_source = meta.source
        else:
            mapper = _get_bank_mapper(request)
            items = mapper.map_items(body.items, body.source_name)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Category mapping failed: {exc}",
        ) from exc

    return CategoryMapResponse(items=items)
