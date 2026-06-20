from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from schemas import CategoryMapRequest, CategoryMapRequestItem, CategoryMapResponse
from services.category_text_utils import sanitize_category
from services.mapper_service import MapperService
from services.market_split_map_service import MarketSplitMapService
from services.retailer_resolver_service import RetailerResolverService

router = APIRouter(prefix="/api/category", tags=["category"])


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


@router.post("/map", response_model=CategoryMapResponse)
def category_map(
    body: CategoryMapRequest,
    request: Request,
    bg_tasks: BackgroundTasks,
) -> CategoryMapResponse:
    try:
        if body.kind == "market":
            mapper = _get_market_mapper(request)
            prepared_items: list[CategoryMapRequestItem] = []
            normalized_keys: list[str] = []
            sanitized_meta = []
            for item in body.items:
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
            mapper = _get_bank_mapper(request)  # bank-only: parent_category_synonyms.json
            items = mapper.map_items(body.items, body.source_name)
            resolver = _get_retailer_resolver(request)
            if resolver:
                enrich_names = {
                    item.raw_category for item in items if item.should_enrich_retailer
                }
                for name in enrich_names:
                    bg_tasks.add_task(resolver.enrich_and_save, name)
            for item in items:
                item.should_enrich_retailer = False
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Category mapping failed: {exc}",
        ) from exc

    return CategoryMapResponse(items=items)
