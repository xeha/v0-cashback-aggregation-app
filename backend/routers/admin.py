import os

from fastapi import APIRouter, Header, HTTPException

from services import catalog_store

router = APIRouter()


@router.post("/api/admin/reload-catalogs")
async def reload_catalogs(x_admin_key: str = Header(...)) -> dict:
    expected = os.environ.get("ADMIN_KEY", "")
    if not expected or x_admin_key != expected:
        raise HTTPException(status_code=403, detail="Invalid admin key")
    await catalog_store.load_all()
    return {"reloaded": catalog_store.loaded_names()}
