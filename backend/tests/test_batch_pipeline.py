from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import BackgroundTasks, HTTPException

from schemas import (
    BatchPipelineRequest,
    BatchSubmissionInput,
    MappedItem,
)
from services import pipeline_service
from services.pipeline_service import process_batch


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


def test_process_batch_merges_two_bank_submissions(monkeypatch):
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

    body = BatchPipelineRequest(
        submissions=[
            BatchSubmissionInput(
                image_base64="abc",
                provider_name="Альфа-Банк",
                provider_slug="alfa-bank",
                kind="bank",
            ),
            BatchSubmissionInput(
                image_base64="def",
                provider_name="Т-Банк",
                provider_slug="t-bank",
                kind="bank",
            ),
        ]
    )
    result = process_batch(body, _request_with_mappers(), BackgroundTasks())
    assert result.matrix.bank is not None
    assert len(result.matrix.bank.providers) == 2
    assert result.matrix.bank.groups is not None


def test_process_batch_returns_partial_state_on_ocr_failure(monkeypatch):
    def fake_extract(image_base64, mime_type, kind):
        if image_base64 == "bad":
            return []
        return [SimpleNamespace(raw_category="Кафе", rate=5)]

    monkeypatch.setattr(pipeline_service, "extract_cashback_items", fake_extract)
    monkeypatch.setattr(
        pipeline_service,
        "_map_categories",
        lambda *args: [_mapped_item()],
    )

    body = BatchPipelineRequest(
        submissions=[
            BatchSubmissionInput(image_base64="ok", provider_name="Альфа-Банк", kind="bank"),
            BatchSubmissionInput(image_base64="bad", provider_name="Т-Банк", kind="bank"),
        ]
    )

    with pytest.raises(HTTPException) as exc:
        process_batch(body, _request_with_mappers(), BackgroundTasks())

    assert exc.value.status_code == 422
    detail = exc.value.detail
    assert detail["failed_index"] == 1
    assert detail["is_ocr_failure"] is True
    assert detail["matrix"]["bank"] is not None
    assert len(detail["matrix"]["bank"]["providers"]) == 1
