from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import BackgroundTasks, HTTPException

from schemas import MappedItem, ProcessSubmissionRequest
from services import pipeline_service
from services.pipeline_service import process_submission


def _mapped_item(**overrides) -> MappedItem:
    base = {
        "raw_category": "Кафе",
        "unified_category": "Кафе и рестораны",
        "rate": 5,
        "confidence": 0.9,
    }
    base.update(overrides)
    return MappedItem(**base)


def _request_with_mappers() -> SimpleNamespace:
    bank_mapper = MagicMock()
    bank_mapper.is_loaded = True
    bank_mapper.map_items.return_value = [_mapped_item()]
    market_mapper = MagicMock()
    market_mapper.is_loaded = True
    return SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                bank_mapper=bank_mapper,
                mapper=bank_mapper,
                market_mapper=market_mapper,
                retailer_resolver=None,
            )
        )
    )


def test_process_submission_raises_when_ocr_empty(monkeypatch):
    monkeypatch.setattr(pipeline_service, "extract_cashback_items", lambda *args: [])
    body = ProcessSubmissionRequest(
        image_base64="abc",
        provider_name="Альфа-Банк",
        kind="bank",
    )
    with pytest.raises(HTTPException) as exc:
        process_submission(body, _request_with_mappers(), BackgroundTasks())
    assert exc.value.status_code == 422
    assert "не найдены" in str(exc.value.detail)


def test_process_submission_raises_when_unreliable(monkeypatch):
    monkeypatch.setattr(
        pipeline_service,
        "extract_cashback_items",
        lambda *args: [SimpleNamespace(raw_category="x", rate=1)],
    )
    monkeypatch.setattr(
        pipeline_service,
        "_map_categories",
        lambda *args: [_mapped_item(confidence=0.1, match_source="embedding")],
    )
    body = ProcessSubmissionRequest(
        image_base64="abc",
        provider_name="Альфа-Банк",
        kind="bank",
    )
    with pytest.raises(HTTPException) as exc:
        process_submission(body, _request_with_mappers(), BackgroundTasks())
    assert exc.value.status_code == 422
    assert "неуверенно" in str(exc.value.detail)


def test_process_submission_returns_matrix(monkeypatch):
    monkeypatch.setattr(
        pipeline_service,
        "extract_cashback_items",
        lambda *args: [SimpleNamespace(raw_category="Кафе", rate=5)],
    )
    monkeypatch.setattr(
        pipeline_service,
        "_map_categories",
        lambda *args: [_mapped_item()],
    )
    body = ProcessSubmissionRequest(
        image_base64="abc",
        provider_name="Альфа-Банк",
        provider_slug="alfa-bank",
        kind="bank",
    )
    result = process_submission(body, _request_with_mappers(), BackgroundTasks())
    assert result.matrix.kind == "bank"
    assert len(result.matrix.providers) == 1
    assert result.matrix.providers[0].slug == "alfa-bank"
    assert result.matrix.rows[0].rates
    assert isinstance(result.groups, list)
