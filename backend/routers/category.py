from fastapi import APIRouter, HTTPException, Request

from schemas import CategoryMapRequest, CategoryMapResponse
from services.category_normalizer_service import CategoryNormalizerService
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


def _get_category_normalizer(request: Request) -> CategoryNormalizerService:
    normalizer: CategoryNormalizerService | None = getattr(
        request.app.state, "category_normalizer", None
    )
    if normalizer is None or not normalizer.is_loaded:
        raise HTTPException(status_code=503, detail="Category normalizer is not ready")
    return normalizer


@router.post("/map", response_model=CategoryMapResponse)
def category_map(body: CategoryMapRequest, request: Request) -> CategoryMapResponse:
    try:
        if body.kind == "market":
            mapper = _get_reference_mapper(request)
            normalizer = _get_category_normalizer(request)
            norm_results = [normalizer.normalize(item.raw_category) for item in body.items]
            items = mapper.map_items(
                body.items,
                body.source_name,
                [result.normalized for result in norm_results],
            )
            for mapped, norm in zip(items, norm_results):
                mapped.normalized_raw_category = norm.normalized
                mapped.normalize_source = norm.source
        else:
            mapper = _get_bank_mapper(request)
            items = mapper.map_items(body.items, body.source_name)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Category mapping failed: {exc}",
        ) from exc

    return CategoryMapResponse(items=items)
