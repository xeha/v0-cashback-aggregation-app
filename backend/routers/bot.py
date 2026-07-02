import os

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/bot", tags=["bot"])

WELCOME_TEXT = (
    "Привет! 👋\n\n"
    "Загрузи скриншоты из банковских приложений — и я покажу, "
    "по какой карте выгоднее платить в магазине, ресторане или на заправке.\n\n"
    "Нажми кнопку ниже, чтобы начать 👇"
)


@router.post("/webhook")
async def webhook(request: Request):
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"ok": True})

    message = data.get("message", {})
    text = message.get("text", "")
    chat_id = message.get("chat", {}).get("id")

    if chat_id and text == "/start":
        mini_app_url = os.getenv("TELEGRAM_MINI_APP_URL", "https://cashbackbrain.ru")
        return JSONResponse({
            "method": "sendMessage",
            "chat_id": chat_id,
            "text": WELCOME_TEXT,
            "reply_markup": {
                "inline_keyboard": [[{
                    "text": "💳 Открыть приложение",
                    "web_app": {"url": mini_app_url},
                }]]
            },
        })

    return JSONResponse({"ok": True})
