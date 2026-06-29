import pytest
from fastapi.testclient import TestClient

from main import app
from services import email_mx_service
from services.email_mx_service import (
    EmailValidationError,
    RateLimiter,
    domain_accepts_mail,
    validate_email_format,
    validate_email_with_mx,
)


def test_validate_email_format_normalizes():
    result = validate_email_format("  User@Example.COM ")
    assert result.email == "user@example.com"
    assert result.domain == "example.com"


def test_validate_email_format_rejects_invalid():
    result = validate_email_format("not-an-email")
    assert isinstance(result, EmailValidationError)


def test_domain_accepts_mail_with_mx_records():
    assert domain_accepts_mail(
        "example.com",
        resolve_mx=lambda _domain: ["mx.example.com"],
        resolve_a=lambda _domain: [],
    )


def test_domain_accepts_mail_falls_back_to_a_record():
    assert domain_accepts_mail(
        "example.com",
        resolve_mx=lambda _domain: [],
        resolve_a=lambda _domain: ["93.184.216.34"],
    )


def test_domain_accepts_mail_rejects_when_no_records():
    assert not domain_accepts_mail(
        "missing.nomxtest",
        resolve_mx=lambda _domain: [],
        resolve_a=lambda _domain: [],
    )


def test_skips_mx_for_test_suffix(monkeypatch):
    monkeypatch.setattr(email_mx_service, "_skip_suffixes", lambda: (".test",))
    result = validate_email_with_mx(
        "user@cashbackbrain.test",
        resolve_mx=lambda _domain: [],
        resolve_a=lambda _domain: [],
    )
    assert result.email == "user@cashbackbrain.test"
    assert result.has_mx is True


def test_validate_email_with_mx_rejects_bad_domain():
    result = validate_email_with_mx(
        "user@no-mail-domain.nomxtest",
        resolve_mx=lambda _domain: [],
        resolve_a=lambda _domain: [],
    )
    assert isinstance(result, EmailValidationError)
    assert result.code == "INVALID_EMAIL_DOMAIN"


def test_rate_limiter_blocks_after_limit():
    limiter = RateLimiter(2)
    assert limiter.is_allowed("127.0.0.1")
    assert limiter.is_allowed("127.0.0.1")
    assert not limiter.is_allowed("127.0.0.1")


def test_validate_email_endpoint_success(monkeypatch):
    monkeypatch.setattr(
        email_mx_service,
        "validate_email_with_mx",
        lambda email: email_mx_service.EmailValidationResult(
            email="user@example.com",
            domain="example.com",
            has_mx=True,
        ),
    )

    client = TestClient(app)
    response = client.post("/api/auth/validate-email", json={"email": "user@example.com"})
    assert response.status_code == 200
    assert response.json() == {
        "valid": True,
        "email": "user@example.com",
        "domain": "example.com",
        "mx": True,
    }


def test_validate_email_endpoint_validation_error(monkeypatch):
    monkeypatch.setattr(
        email_mx_service,
        "validate_email_with_mx",
        lambda email: EmailValidationError("VALIDATION_ERROR", "Введите email"),
    )

    client = TestClient(app)
    response = client.post("/api/auth/validate-email", json={"email": "bad"})
    assert response.status_code == 400
    body = response.json()
    assert body["detail"]["error"]["code"] == "VALIDATION_ERROR"


def test_validate_email_endpoint_rate_limit(monkeypatch):
    monkeypatch.setattr(
        email_mx_service,
        "validate_email_with_mx",
        lambda email: email_mx_service.EmailValidationResult(
            email="user@example.com",
            domain="example.com",
            has_mx=True,
        ),
    )
    monkeypatch.setattr(email_mx_service, "email_mx_rate_limiter", RateLimiter(1))

    client = TestClient(app)
    assert client.post("/api/auth/validate-email", json={"email": "user@example.com"}).status_code == 200
    assert client.post("/api/auth/validate-email", json={"email": "user@example.com"}).status_code == 429
