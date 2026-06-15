from fastapi import APIRouter, HTTPException, Request

from schemas import CategoryMapRequest, CategoryMapResponse
from services.mapper_service import MapperService

router = APIRouter(prefix="/api/category", tags=["category"])


def _get_mapper(request: Request) -> MapperService:
    mapper: MapperService | None = getattr(request.app.state, "mapper", None)
    if mapper is None or not mapper.is_loaded:
        raise HTTPException(status_code=503, detail="Category mapper is not ready")
    return mapper


@router.post("/map", response_model=CategoryMapResponse)
def category_map(body: CategoryMapRequest, request: Request) -> CategoryMapResponse:
    mapper = _get_mapper(request)
    try:
        items = mapper.map_items(body.items, body.source_name)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Category mapping failed: {exc}",
        ) from exc

    return CategoryMapResponse(items=items)
