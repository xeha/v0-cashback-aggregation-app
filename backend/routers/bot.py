import os
import httpx
from fastapi import APIRouter, Request

router = APIRouter(prefix="/bot", tags=["bot"])

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
MINI_APP_URL = os.getenv("TELEGRAM_MINI_APP_URL", "https://t.me/CashbackBrain_bot/cashscan")
_TG_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

WELCOME_TEXT = (
    "Привет! 👋\n\n"
    "Загрузи скриншоты из банковских приложений — и я покажу, "
    "по какой карте выгоднее платить в магазине, ресторане или на заправке.\n\n"
    "Нажми кнопку ниже, чтобы начать 👇"
)


@router.post("/webhook")
async def webhook(request: Request):
    if not BOT_TOKEN:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN not set"}

    data = await request.json()
    message = data.get("message", {})
    text = message.get("text", "")
    chat_id = message.get("chat", {}).get("id")

    if chat_id and text == "/start":
        await _send_welcome(chat_id)

    return {"ok": True}


async def _send_welcome(chat_id: int) -> None:
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(f"{_TG_API}/sendMessage", json={
            "chat_id": chat_id,
            "text": WELCOME_TEXT,
            "reply_markup": {
                "inline_keyboard": [[{
                    "text": "💳 Открыть приложение",
                    "web_app": {"url": MINI_APP_URL},
                }]]
            },
        })
