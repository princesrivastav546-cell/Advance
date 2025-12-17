FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render expects something listening on $PORT (Web Service)
CMD sh -c "gunicorn --log-level info --access-logfile - --error-logfile - -w 1 -b 0.0.0.0:${PORT:-10000} web:app & python bot.py"
