from fastapi import APIRouter, HTTPException
import httpx

from schemas import OcrExtractRequest, OcrExtractResponse
from services.ocr_service import extract_cashback_items

router = APIRouter(prefix="/api/ocr", tags=["ocr"])


def _is_timeout_error(exc: BaseException) -> bool:
    if isinstance(exc, (TimeoutError, httpx.TimeoutException)):
        return True
    if isinstance(exc, OSError) and exc.errno in {60, 110}:
        return True
    message = str(exc).lower()
    return "timed out" in message or "timeout" in message


def _is_transient_ocr_error(exc: BaseException) -> bool:
    if _is_timeout_error(exc):
        return True
    if isinstance(
        exc,
        (
            httpx.ConnectError,
            httpx.ReadError,
            httpx.RemoteProtocolError,
            httpx.WriteError,
        ),
    ):
        return True
    message = str(exc).lower()
    return any(token in message for token in ("ssl", "eof", "connection reset", "broken pipe"))


@router.post("/extract", response_model=OcrExtractResponse)
def ocr_extract(body: OcrExtractRequest) -> OcrExtractResponse:
    try:
        items = extract_cashback_items(body.image_base64, body.mime_type, body.kind)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        if _is_transient_ocr_error(exc):
            raise HTTPException(
                status_code=502,
                detail="Сбой соединения с сервисом распознавания. Попробуйте ещё раз.",
            ) from exc
        raise HTTPException(
            status_code=502,
            detail=f"OCR processing failed: {exc}",
        ) from exc

    return OcrExtractResponse(items=items)
