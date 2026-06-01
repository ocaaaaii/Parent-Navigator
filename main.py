"""
育兒導航全攻略 - RAG Backend
FastAPI + ChromaDB + LLM (Claude / OpenAI)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn

from rag_engine import RAGEngine
from reminder_service import ReminderService

app = FastAPI(title="育兒導航 API", version="1.0.0")

# ---- CORS（允許前端跨域呼叫）----
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # Vite / CRA
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- 初始化核心服務 ----
rag = RAGEngine()
reminder = ReminderService()


# ---- Request / Response Models ----

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "default"
    city: Optional[str] = None          # 讓前端帶入使用者縣市，提高回覆精準度


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]                 # 回傳來源，方便前端顯示「資料來源」
    suggested_questions: list[str]      # 引導使用者繼續問


class ReminderRequest(BaseModel):
    child_birthday: str                 # "2024-03-15" (ISO 格式)
    city: str                           # "台北市"


# ---- API Endpoints ----

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "育兒導航 API 運行中"}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """
    主要 RAG 問答端點
    前端懸浮聊天視窗呼叫這裡
    """
    try:
        result = await rag.query(
            question=req.message,
            city_filter=req.city,
            session_id=req.session_id,
        )
        return ChatResponse(
            answer=result["answer"],
            sources=result["sources"],
            suggested_questions=result["suggested_questions"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/reminders")
async def get_reminders(req: ReminderRequest):
    """
    根據寶寶生日計算近期該做的事
    回傳：疫苗、健檢、補助申請提醒清單
    """
    try:
        reminders = reminder.calculate(req.child_birthday, req.city)
        return {"reminders": reminders}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/categories")
def get_categories():
    """
    回傳知識庫的分類清單（供前端快捷按鈕使用）
    """
    return {
        "categories": [
            {"id": "subsidy",   "label": "補助申請", "icon": "💰"},
            {"id": "daycare",   "label": "托嬰資訊", "icon": "🏠"},
            {"id": "checkup",   "label": "兒童健檢", "icon": "🏥"},
            {"id": "parental",  "label": "育嬰留職", "icon": "👶"},
        ]
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
