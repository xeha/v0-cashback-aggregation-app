from typing import Literal

from pydantic import BaseModel, Field


class OcrExtractRequest(BaseModel):
    image_base64: str = Field(..., min_length=1)
    mime_type: Literal["image/jpeg", "image/png", "image/jpg"] = "image/jpeg"


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


class MappedItem(BaseModel):
    raw_category: str
    unified_category: str
    rate: float
    confidence: float


class CategoryMapResponse(BaseModel):
    items: list[MappedItem]


class HealthResponse(BaseModel):
    status: str
    mapper_loaded: bool
