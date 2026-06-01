# Dockerfile — 育兒導航 Agent
# 基底映像：Python 3.11 slim（體積小、安全性高）
# 正式部署建議使用 gunicorn 取代 Flask dev server

FROM python:3.11-slim

# ── 系統依賴 ──────────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        default-libmysqlclient-dev \
    && rm -rf /var/lib/apt/lists/*

# ── 工作目錄 ──────────────────────────────────────────────────────────────────
WORKDIR /app

# ── 安裝 Python 套件（先複製 requirements.txt，利用 Docker layer cache） ────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── 複製應用程式碼 ────────────────────────────────────────────────────────────
COPY . .

# ── 建立必要資料夾 ────────────────────────────────────────────────────────────
RUN mkdir -p /app/chroma_db /app/wiki /app/logs

# ── 環境變數預設值（正式部署請透過平台環境變數覆寫） ──────────────────────────
ENV FLASK_DEBUG=false \
    FLASK_PORT=5000 \
    CHROMA_PERSIST_DIR=/app/chroma_db \
    WIKI_DIR=/app/wiki

# ── 暴露 Port ─────────────────────────────────────────────────────────────────
EXPOSE 5000

# ── 啟動指令（使用 gunicorn，2 workers） ─────────────────────────────────────
# use_reloader=False 已在 app.py 處理，gunicorn 不需額外設定
CMD ["gunicorn", \
     "--bind", "0.0.0.0:5000", \
     "--workers", "2", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "app:app"]
