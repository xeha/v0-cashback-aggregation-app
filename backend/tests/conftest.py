import json
import sys
from pathlib import Path

import pytest

from services import catalog_store

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

REPO_ROOT = BACKEND_ROOT.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

DATA_DIR = BACKEND_ROOT / "data"


def _load_local_catalogs() -> dict[str, object]:
    store: dict[str, object] = {}
    if DATA_DIR.exists():
        for json_file in DATA_DIR.glob("*.json"):
            try:
                store[json_file.stem] = json.loads(json_file.read_text(encoding="utf-8"))
            except Exception:
                pass
    return store


# Ensure module-level service initialization in tests can resolve catalogs during collection.
catalog_store._store = _load_local_catalogs()


@pytest.fixture(autouse=True)
def load_catalogs_from_local(monkeypatch):
    store = _load_local_catalogs()
    monkeypatch.setattr(catalog_store, "_store", store)
