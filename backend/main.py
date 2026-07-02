import os
import asyncio
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer

from routers import admin, auth, bot, category, ocr, pipeline
from services import catalog_store
from schemas import HealthResponse
from services.market_split_map_service import MarketSplitMapService
from services.mapper_service import MapperService
from services.retailer_resolver_service import RetailerResolverService

load_dotenv()


def _allowed_origins() -> list[str]:
    defaults = ["http://localhost:3000", "http://127.0.0.1:3000"]
    extra = os.environ.get("ALLOWED_ORIGINS", "")
    if extra:
        defaults.extend(origin.strip() for origin in extra.split(",") if origin.strip())
    return defaults


def _local_network_origin_regex() -> str:
    """Allow phone testing over Wi-Fi (Next.js dev on port 3000)."""
    return r"http://(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}):3000"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await catalog_store.load_all()
    model_name = os.environ.get(
        "SENTENCE_TRANSFORMER_MODEL",
        "paraphrase-multilingual-MiniLM-L12-v2",
    )
    shared_model = SentenceTransformer(model_name)

    bank_mapper = MapperService()
    bank_mapper.load(model=shared_model)

    retailer_resolver = RetailerResolverService()
    await asyncio.to_thread(retailer_resolver.load)
    retailer_resolver.set_allowed_parents(bank_mapper._parents)
    bank_mapper.set_retailer_resolver(retailer_resolver)

    market_mapper = MarketSplitMapService()
    market_mapper.load()

    app.state.mapper = bank_mapper
    app.state.bank_mapper = bank_mapper
    app.state.market_mapper = market_mapper
    app.state.retailer_resolver = retailer_resolver
    yield


app = FastAPI(title="Cashback OCR API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_origin_regex=_local_network_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ocr.router)
app.include_router(category.router)
app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(pipeline.router)
app.include_router(bot.router)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    bank_mapper: MapperService | None = getattr(app.state, "bank_mapper", None) or getattr(
        app.state, "mapper", None
    )
    market_mapper: MarketSplitMapService | None = getattr(app.state, "market_mapper", None)
    bank_loaded = bool(bank_mapper and bank_mapper.is_loaded)
    market_loaded = bool(market_mapper and market_mapper.is_loaded)
    return HealthResponse(
        status="ok",
        mapper_loaded=bank_loaded,
        bank_mapper_loaded=bank_loaded,
        market_mapper_loaded=market_loaded,
    )
