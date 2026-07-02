import logging
import os

import httpx
from fastapi import APIRouter, Request

router = APIRouter(prefix="/bot", tags=["bot"])

logger = logging.getLogger(__name__)

WELCOME_TEXT = (
    "Привет! 👋\n\n"
    "Загрузи скриншоты из банковских приложений — и я покажу, "
    "по какой карте выгоднее платить в магазине, ресторане или на заправке.\n\n"
    "Нажми кнопку ниже, чтобы начать 👇"
)


@router.post("/webhook")
async def webhook(request: Request):
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN not set"}

    try:
        data = await request.json()
    except Exception:
        return {"ok": False, "error": "invalid JSON"}

    message = data.get("message", {})
    text = message.get("text", "")
    chat_id = message.get("chat", {}).get("id")

    if chat_id and text == "/start":
        try:
            await _send_welcome(chat_id, token)
        except Exception as e:
            logger.exception("Failed to send welcome to chat_id=%s: %s", chat_id, e)

    return {"ok": True}


async def _send_welcome(chat_id: int, token: str) -> None:
    mini_app_url = os.getenv("TELEGRAM_MINI_APP_URL", "https://cashbackbrain.ru")
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": WELCOME_TEXT,
                "reply_markup": {
                    "inline_keyboard": [[{
                        "text": "💳 Открыть приложение",
                        "web_app": {"url": mini_app_url},
                    }]]
                },
            },
        )
        if not resp.is_success:
            logger.error("Telegram sendMessage failed: %s", resp.text)
