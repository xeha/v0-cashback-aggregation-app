from fastapi import APIRouter, HTTPException, Request

from schemas import (
    AuthValidationErrorDetail,
    AuthValidationErrorResponse,
    ValidateEmailRequest,
    ValidateEmailResponse,
)
from services import email_mx_service
from services.email_mx_service import EmailValidationError, validate_email_with_mx

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    # X-Forwarded-For is not trusted here: without a verified proxy allowlist,
    # any client can spoof arbitrary IPs to bypass the rate limiter.
    # Use the direct connection IP instead.
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


@router.post("/validate-email", response_model=ValidateEmailResponse)
def validate_email(body: ValidateEmailRequest, request: Request) -> ValidateEmailResponse:
    client_ip = _client_ip(request)
    if not email_mx_service.email_mx_rate_limiter.is_allowed(client_ip):
        raise HTTPException(
            status_code=429,
            detail={
                "error": {
                    "code": "RATE_LIMIT",
                    "message": "Слишком много попыток. Попробуйте позже",
                }
            },
        )

    result = validate_email_with_mx(body.email)
    if isinstance(result, EmailValidationError):
        raise HTTPException(
            status_code=400,
            detail=AuthValidationErrorResponse(
                error=AuthValidationErrorDetail(
                    code=result.code,
                    message=result.message,
                    details=[{"field": result.field, "message": result.message}],
                )
            ).model_dump(),
        )

    return ValidateEmailResponse(
        valid=True,
        email=result.email,
        domain=result.domain,
        mx=result.has_mx,
    )
