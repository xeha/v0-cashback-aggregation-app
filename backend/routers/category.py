from fastapi import APIRouter, HTTPException, Request

from schemas import CategoryMapRequest, CategoryMapResponse
from services.mapper_service import MapperService
from services.market_mapper_service import MarketMapperService

router = APIRouter(prefix="/api/category", tags=["category"])


def _get_bank_mapper(request: Request) -> MapperService:
    mapper: MapperService | None = getattr(request.app.state, "bank_mapper", None) or getattr(
        request.app.state, "mapper", None
    )
    if mapper is None or not mapper.is_loaded:
        raise HTTPException(status_code=503, detail="Bank category mapper is not ready")
    return mapper


def _get_market_mapper(request: Request) -> MarketMapperService:
    mapper: MarketMapperService | None = getattr(request.app.state, "market_mapper", None)
    if mapper is None or not mapper.is_loaded:
        raise HTTPException(status_code=503, detail="Market category mapper is not ready")
    return mapper


@router.post("/map", response_model=CategoryMapResponse)
def category_map(body: CategoryMapRequest, request: Request) -> CategoryMapResponse:
    try:
        if body.kind == "market":
            mapper = _get_market_mapper(request)
            items = mapper.map_items(body.items, body.source_name, body.source_slug)
        else:
            mapper = _get_bank_mapper(request)
            items = mapper.map_items(body.items, body.source_name)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Category mapping failed: {exc}",
        ) from exc

    return CategoryMapResponse(items=items)
