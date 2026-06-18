import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer

from routers import category, ocr
from schemas import HealthResponse
from services.category_normalizer_service import CategoryNormalizerService
from services.reference_mapper_service import ReferenceMapperService
from services.mapper_service import MapperService

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
    model_name = os.environ.get(
        "SENTENCE_TRANSFORMER_MODEL",
        "paraphrase-multilingual-MiniLM-L12-v2",
    )
    shared_model = SentenceTransformer(model_name)

    bank_mapper = MapperService()
    bank_mapper.load(model=shared_model)

    reference_mapper = ReferenceMapperService()
    reference_mapper.load()

    category_normalizer = CategoryNormalizerService()
    category_normalizer.load()

    app.state.mapper = bank_mapper
    app.state.bank_mapper = bank_mapper
    app.state.reference_mapper = reference_mapper
    app.state.market_mapper = reference_mapper
    app.state.category_normalizer = category_normalizer
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


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    bank_mapper: MapperService | None = getattr(app.state, "bank_mapper", None) or getattr(
        app.state, "mapper", None
    )
    reference_mapper: ReferenceMapperService | None = getattr(app.state, "reference_mapper", None)
    bank_loaded = bool(bank_mapper and bank_mapper.is_loaded)
    market_loaded = bool(reference_mapper and reference_mapper.is_loaded)
    return HealthResponse(
        status="ok",
        mapper_loaded=bank_loaded,
        bank_mapper_loaded=bank_loaded,
        market_mapper_loaded=market_loaded,
    )
