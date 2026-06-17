import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import category, ocr
from schemas import HealthResponse
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
    mapper = MapperService()
    mapper.load()
    app.state.mapper = mapper
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
    mapper: MapperService | None = getattr(app.state, "mapper", None)
    return HealthResponse(
        status="ok",
        mapper_loaded=bool(mapper and mapper.is_loaded),
    )
