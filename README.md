# 育兒導航全攻略 🌿
**基於 RAG 與時序提醒之新手爸媽智慧應援 Agent**

---

## 專案結構

```
parenting-nav/
├── backend/
│   ├── main.py              # FastAPI 主程式（API 路由）
│   ├── rag_engine.py        # RAG 核心：向量檢索 + LLM 生成
│   ├── reminder_service.py  # 時序推播：疫苗/健檢/補助提醒
│   ├── requirements.txt     # Python 套件清單
│   └── .env.example         # 環境變數範本
│
├── frontend/
│   └── ChatWidget.jsx       # 懸浮聊天視窗 React 元件
│
└── data/
    ├── Agents.md            # LLM Wiki 規則書（給 AI 助理看）
    ├── raw_sources/         # 原始 PDF / 網頁文字（不要修改）
    └── wiki_pages/          # AI 整理後的結構化 Markdown（餵進 RAG）
        └── 全國_育兒津貼.md  # 範例筆記
```

---

## 快速開始

### 1. 後端啟動

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env          # 填入 API Keys
python main.py                # 啟動在 http://localhost:8000
```

### 2. 建立 RAG 知識庫（第一次）

先把 `data/wiki_pages/` 資料夾填滿 Markdown 筆記（見 Agents.md 說明），然後：

```bash
cd backend
python -c "
from rag_engine import RAGEngine
engine = RAGEngine()
engine.ingest_markdown_folder('../data/wiki_pages')
"
```

### 3. 前端整合

```jsx
// 在你的主 App 引入聊天元件
import ChatWidget from './components/ChatWidget'

function App() {
  return (
    <>
      {/* 你的主網站內容 */}
      <ChatWidget city="台北市" />   {/* 傳入使用者縣市以提升精準度 */}
    </>
  )
}
```

---

## 分工建議

| 組別 | 工作 | 使用哪些檔案 |
|------|------|------------|
| **資料組** | 蒐集 PDF、用 AI 整理成 Markdown | `data/Agents.md`, `data/wiki_pages/` |
| **RAG 組** | 調優 chunking、測試回答品質 | `backend/rag_engine.py` |
| **時序組** | 完善里程碑表、接 MySQL | `backend/reminder_service.py` |
| **前端組** | 主網站 UI + 聊天元件整合 | `frontend/ChatWidget.jsx` |

---

## API 端點

| 端點 | 方法 | 說明 |
|------|------|------|
| `/health` | GET | 健康檢查 |
| `/api/chat` | POST | RAG 問答（聊天視窗呼叫這裡）|
| `/api/reminders` | POST | 時序提醒（輸入寶寶生日）|
| `/api/categories` | GET | 快捷按鈕分類清單 |

### `/api/chat` 請求範例

```json
{
  "message": "育兒津貼怎麼申請？",
  "city": "台北市",
  "session_id": "user_123"
}
```

---

## Demo 情境劇本（評審必問）

1. 點「補助申請」→ 展示 RAG 回答育兒津貼申請流程
2. 問「托嬰資訊」→ 展示系統能根據縣市過濾資料
3. 輸入寶寶生日 → 展示時序提醒清單（疫苗/健檢）
4. 問一個知識庫沒有的問題 → 展示系統誠實說「不知道」並引導到 1957
