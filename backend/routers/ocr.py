from fastapi import APIRouter, HTTPException

from schemas import OcrExtractRequest, OcrExtractResponse
from services.ocr_service import extract_cashback_items

router = APIRouter(prefix="/api/ocr", tags=["ocr"])


@router.post("/extract", response_model=OcrExtractResponse)
def ocr_extract(body: OcrExtractRequest) -> OcrExtractResponse:
    try:
        items = extract_cashback_items(body.image_base64, body.mime_type, body.kind)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"OCR processing failed: {exc}",
        ) from exc

    return OcrExtractResponse(items=items)
