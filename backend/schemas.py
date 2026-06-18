from typing import Literal

from pydantic import BaseModel, Field


class OcrExtractRequest(BaseModel):
    image_base64: str = Field(..., min_length=1)
    mime_type: Literal["image/jpeg", "image/png", "image/jpg"] = "image/jpeg"
    kind: Literal["bank", "market"] = "bank"


class OcrItem(BaseModel):
    raw_category: str
    rate: float


class OcrExtractResponse(BaseModel):
    items: list[OcrItem]


class CategoryMapRequestItem(BaseModel):
    raw_category: str
    rate: float


class CategoryMapRequest(BaseModel):
    items: list[CategoryMapRequestItem]
    source_name: str | None = None
    kind: Literal["bank", "market"] = "bank"
    source_slug: str | None = None


class MappedItem(BaseModel):
    raw_category: str
    unified_category: str
    unified_subcategory: str | None = None
    unified_parent: str | None = None
    rate: float
    confidence: float
    is_bank_offer: bool = False
    is_macro_category: bool = False
    match_source: Literal[
        "catalog",
        "override",
        "parent",
        "named",
        "leaf_exact",
        "parent_embedding",
        "leaf_embedding",
        "llm_parent",
        "fallback",
        "embedding",
    ] | None = None


class CategoryMapResponse(BaseModel):
    items: list[MappedItem]


class HealthResponse(BaseModel):
    status: str
    mapper_loaded: bool
    bank_mapper_loaded: bool = False
    market_mapper_loaded: bool = False
