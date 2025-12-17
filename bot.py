import os
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, ContextTypes, filters

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
MINIAPP_URL = os.environ.get("MINIAPP_URL", "")  # e.g. https://your-service.onrender.com/app

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not MINIAPP_URL:
        await update.message.reply_text("❌ MINIAPP_URL env var is missing on Render.")
        return

    kb = [[InlineKeyboardButton("🚀 Open Mini App", web_app={"url": MINIAPP_URL})]]
    await update.message.reply_text(
        "Open the Mini App below 👇",
        reply_markup=InlineKeyboardMarkup(kb),
    )

async def handle_webapp_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Telegram sends data from WebApp via message.web_app_data.data
    data = update.effective_message.web_app_data.data if update.effective_message else None
    await update.message.reply_text(f"✅ Got data from Mini App:\n\n{data}")

def main():
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN env var missing.")

    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))

    # Captures WebAppData messages
    app.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_webapp_data))

    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
