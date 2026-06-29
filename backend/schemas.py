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


class ReferencePathNode(BaseModel):
    id: str
    name: str


class MappedItem(BaseModel):
    raw_category: str
    normalized_raw_category: str | None = None
    normalize_source: Literal["sanitize", "passthrough"] | None = None
    split_text: str | None = None
    unified_category: str
    unified_subcategory: str | None = None
    unified_parent: str | None = None
    rate: float
    confidence: float
    is_bank_offer: bool = False
    is_macro_category: bool = False
    match_source: Literal[
        "catalog",
        "retailer_catalog",
        "override",
        "parent",
        "named",
        "leaf_exact",
        "parent_embedding",
        "leaf_embedding",
        "coarse_cashback",
        "llm_parent",
        "fallback",
        "embedding",
        "reference_llm",
        "reference_cache",
        "reference_fallback",
        "reference_split_llm",
    ] | None = None
    should_enrich_retailer: bool = False
    display_label: str | None = None
    reference_node_id: str | None = None
    reference_department: str | None = None
    reference_category: str | None = None
    reference_subcategory: str | None = None
    reference_depth: int | None = None
    reference_path: list[ReferencePathNode] | None = None


class CategoryMapResponse(BaseModel):
    items: list[MappedItem]


class HealthResponse(BaseModel):
    status: str
    mapper_loaded: bool
    bank_mapper_loaded: bool = False
    market_mapper_loaded: bool = False


class ValidateEmailRequest(BaseModel):
    email: str = Field(..., min_length=1, max_length=254)


class ValidateEmailResponse(BaseModel):
    valid: bool
    email: str
    domain: str
    mx: bool


class AuthValidationErrorDetail(BaseModel):
    code: str
    message: str
    details: list[dict[str, str]]


class AuthValidationErrorResponse(BaseModel):
    error: AuthValidationErrorDetail
