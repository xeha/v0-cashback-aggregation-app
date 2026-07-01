"""DNS MX validation for email domains."""

from __future__ import annotations

import os
import re
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Callable

import dns.exception
import dns.resolver

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
EMAIL_MIN_LENGTH = 5
EMAIL_MAX_LENGTH = 254
DEFAULT_DNS_TIMEOUT_SEC = float(os.environ.get("EMAIL_MX_DNS_TIMEOUT_SEC", "5"))
DEFAULT_RATE_LIMIT_PER_MINUTE = int(os.environ.get("EMAIL_MX_RATE_LIMIT_PER_MINUTE", "30"))


@dataclass(frozen=True)
class EmailValidationError:
    code: str
    message: str
    field: str = "email"


@dataclass(frozen=True)
class EmailValidationResult:
    email: str
    domain: str
    has_mx: bool


def _skip_suffixes() -> tuple[str, ...]:
    raw = os.environ.get("EMAIL_MX_SKIP_SUFFIXES", ".test,.localhost,.invalid,.example")
    return tuple(part.strip().lower() for part in raw.split(",") if part.strip())


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email_format(email: str) -> EmailValidationResult | EmailValidationError:
    normalized = normalize_email(email)

    if not normalized:
        return EmailValidationError("VALIDATION_ERROR", "Введите email")

    if len(normalized) < EMAIL_MIN_LENGTH:
        return EmailValidationError("VALIDATION_ERROR", "Email слишком короткий")

    if len(normalized) > EMAIL_MAX_LENGTH:
        return EmailValidationError(
            "VALIDATION_ERROR",
            "Email слишком длинный (максимум 254 символа)",
        )

    if not EMAIL_REGEX.fullmatch(normalized):
        return EmailValidationError(
            "VALIDATION_ERROR",
            "Email должен быть в формате user@example.com",
        )

    domain = normalized.split("@", 1)[1]
    return EmailValidationResult(email=normalized, domain=domain, has_mx=False)


def should_skip_mx_check(domain: str) -> bool:
    lowered = domain.lower()
    return any(lowered.endswith(suffix) for suffix in _skip_suffixes())


def domain_accepts_mail(
    domain: str,
    *,
    resolve_mx: Callable[[str], list[str]] | None = None,
    resolve_a: Callable[[str], list[str]] | None = None,
) -> bool:
    if should_skip_mx_check(domain):
        return True

    mx_lookup = resolve_mx or _resolve_mx
    a_lookup = resolve_a or _resolve_a

    mx_records = mx_lookup(domain)
    if mx_records:
        return True

    return bool(a_lookup(domain))


def validate_email_with_mx(
    email: str,
    *,
    resolve_mx: Callable[[str], list[str]] | None = None,
    resolve_a: Callable[[str], list[str]] | None = None,
) -> EmailValidationResult | EmailValidationError:
    format_result = validate_email_format(email)
    if isinstance(format_result, EmailValidationError):
        return format_result

    if should_skip_mx_check(format_result.domain):
        return EmailValidationResult(
            email=format_result.email,
            domain=format_result.domain,
            has_mx=True,
        )

    has_mx = domain_accepts_mail(
        format_result.domain,
        resolve_mx=resolve_mx,
        resolve_a=resolve_a,
    )
    if not has_mx:
        return EmailValidationError(
            "INVALID_EMAIL_DOMAIN",
            "Домен email не принимает почту — проверьте адрес",
        )

    return EmailValidationResult(
        email=format_result.email,
        domain=format_result.domain,
        has_mx=True,
    )


def _resolver() -> dns.resolver.Resolver:
    resolver = dns.resolver.Resolver()
    resolver.lifetime = DEFAULT_DNS_TIMEOUT_SEC
    return resolver


def _resolve_mx(domain: str) -> list[str]:
    try:
        answers = _resolver().resolve(domain, "MX")
        return [str(answer.exchange).rstrip(".") for answer in answers]
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers):
        return []
    except dns.exception.Timeout:
        return []
    except dns.exception.DNSException:
        return []


def _resolve_a(domain: str) -> list[str]:
    try:
        answers = _resolver().resolve(domain, "A")
        return [str(answer) for answer in answers]
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers):
        return []
    except dns.exception.Timeout:
        return []
    except dns.exception.DNSException:
        return []


class RateLimiter:
    def __init__(self, limit_per_minute: int) -> None:
        self._limit = max(1, limit_per_minute)
        self._hits: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        now = time.monotonic()
        window_start = now - 60.0
        recent = [hit for hit in self._hits[key] if hit >= window_start]
        if len(recent) >= self._limit:
            self._hits[key] = recent
            return False
        recent.append(now)
        self._hits[key] = recent
        return True


email_mx_rate_limiter = RateLimiter(DEFAULT_RATE_LIMIT_PER_MINUTE)
