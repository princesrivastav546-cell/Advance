FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render sets $PORT
CMD sh -c "gunicorn -w 1 -b 0.0.0.0:${PORT:-10000} web:app & python bot.py"
