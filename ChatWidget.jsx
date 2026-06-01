/**
 * 育兒小幫手 AI - 懸浮聊天視窗元件
 * 對應截圖設計：右下角懸浮、深綠色主題、快捷按鈕
 *
 * 使用方式：
 * import ChatWidget from './components/ChatWidget'
 * <ChatWidget city="台北市" />
 */

import { useState, useRef, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ---- 設計 Token（對應 Figma 設計稿深綠色系）----
const COLORS = {
  primary:     "#2D5016",   // 深綠
  primaryMid:  "#3D6B1E",   // 中綠（hover）
  accent:      "#8B5E0A",   // 琥珀色（強調）
  accentLight: "#F5E6C8",   // 淺琥珀（使用者訊息背景）
  bg:          "#FFFFFF",
  surface:     "#F7F5F0",   // 卡片背景（米白）
  text:        "#1A1A1A",
  textMuted:   "#6B7280",
  border:      "#E5E0D8",
};

const QUICK_ACTIONS = [
  { id: "subsidy",  label: "補助申請", icon: "💰" },
  { id: "daycare",  label: "托嬰資訊", icon: "🏠" },
  { id: "checkup",  label: "兒童健檢", icon: "🏥" },
  { id: "parental", label: "育嬰留職", icon: "👶" },
];

const QUICK_QUESTIONS = {
  subsidy:  "育兒津貼怎麼申請？需要準備哪些文件？",
  daycare:  "怎麼查詢附近的公共托育中心名額？",
  checkup:  "寶寶0~3歲有哪些免費健康檢查？",
  parental: "育嬰留職停薪可以領多少？怎麼申請？",
};

// ---- 主元件 ----
export default function ChatWidget({ city = null }) {
  const [isOpen,    setIsOpen]    = useState(false);
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  // 自動滾到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 開啟時聚焦輸入框
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      addWelcomeMessage();
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  function addWelcomeMessage() {
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: "您好！我是育兒小幫手 AI 🌿\n\n我可以幫您查詢育兒補助、疫苗時程、托嬰資訊等，請問有什麼可以幫您的？",
      sources: [],
      suggestions: [],
      timestamp: new Date(),
    }]);
  }

  async function sendMessage(text) {
    if (!text.trim() || loading) return;

    const userMsg = {
      id: `user_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
          city: city,
        }),
      });

      if (!res.ok) throw new Error("API 回應錯誤");
      const data = await res.json();

      setMessages(prev => [...prev, {
        id: `bot_${Date.now()}`,
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
        suggestions: data.suggested_questions || [],
        timestamp: new Date(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `err_${Date.now()}`,
        role: "assistant",
        content: "抱歉，目前服務暫時無法使用，請稍後再試。\n如有急需，請撥打 **1957** 福利諮詢專線。",
        sources: [],
        suggestions: [],
        isError: true,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  // ---- Render ----
  return (
    <>
      <style>{CSS}</style>

      {/* 懸浮按鈕 */}
      {!isOpen && (
        <button
          className="chat-fab"
          onClick={() => setIsOpen(true)}
          aria-label="開啟育兒小幫手"
        >
          <span className="chat-fab-icon">🌿</span>
          <span className="chat-fab-label">育兒小幫手</span>
        </button>
      )}

      {/* 聊天視窗 */}
      {isOpen && (
        <div className="chat-window">
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-left">
              <div className="chat-avatar">🌿</div>
              <div>
                <div className="chat-title">育兒小幫手 AI</div>
                <div className="chat-status">
                  <span className="status-dot" />
                  線上中，隨時可以問我
                </div>
              </div>
            </div>
            <button
              className="chat-close"
              onClick={() => setIsOpen(false)}
              aria-label="關閉"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} onSuggest={sendMessage} />
            ))}
            {loading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          <div className="chat-quick-actions">
            {QUICK_ACTIONS.map(qa => (
              <button
                key={qa.id}
                className="quick-action-btn"
                onClick={() => sendMessage(QUICK_QUESTIONS[qa.id])}
                disabled={loading}
              >
                {qa.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="chat-input-row">
            <input
              ref={inputRef}
              className="chat-input"
              placeholder="輸入問題…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              className="chat-send"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              aria-label="送出"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ---- 訊息氣泡 ----
function MessageBubble({ msg, onSuggest }) {
  const isUser = msg.role === "user";

  // 簡單的 Markdown：**粗體**、換行
  function renderContent(text) {
    return text
      .split("\n")
      .map((line, i) => {
        const bold = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        return <p key={i} dangerouslySetInnerHTML={{ __html: bold }} style={{ margin: "2px 0" }} />;
      });
  }

  return (
    <div className={`msg-row ${isUser ? "msg-user" : "msg-bot"}`}>
      {!isUser && <div className="bot-avatar">🌿</div>}
      <div className={`msg-bubble ${isUser ? "bubble-user" : "bubble-bot"} ${msg.isError ? "bubble-error" : ""}`}>
        <div className="msg-content">{renderContent(msg.content)}</div>

        {/* 來源標籤 */}
        {msg.sources?.length > 0 && (
          <div className="msg-sources">
            {msg.sources.map((s, i) => (
              <a key={i} href={s.url || "#"} target="_blank" rel="noreferrer" className="source-tag">
                📎 {s.title}
              </a>
            ))}
          </div>
        )}

        {/* 建議問題 */}
        {msg.suggestions?.length > 0 && (
          <div className="msg-suggestions">
            {msg.suggestions.map((q, i) => (
              <button key={i} className="suggestion-btn" onClick={() => onSuggest(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="msg-row msg-bot">
      <div className="bot-avatar">🌿</div>
      <div className="msg-bubble bubble-bot typing-bubble">
        <span /><span /><span />
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
    </svg>
  );
}

// ---- CSS-in-JS（全部在這裡，方便複製移植）----
const CSS = `
  .chat-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: ${COLORS.primary};
    color: white;
    border: none;
    border-radius: 50px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 20px rgba(45,80,22,0.35);
    transition: transform 0.2s, box-shadow 0.2s;
    z-index: 9999;
  }
  .chat-fab:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(45,80,22,0.45);
    background: ${COLORS.primaryMid};
  }
  .chat-fab-icon { font-size: 18px; }

  .chat-window {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 380px;
    height: 580px;
    background: ${COLORS.bg};
    border-radius: 20px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.18);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 9999;
    animation: slideUp 0.25s ease;
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .chat-header {
    background: ${COLORS.primary};
    color: white;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .chat-header-left { display: flex; align-items: center; gap: 10px; }
  .chat-avatar {
    width: 36px; height: 36px;
    background: rgba(255,255,255,0.15);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
  }
  .chat-title  { font-size: 15px; font-weight: 700; }
  .chat-status { font-size: 11px; opacity: 0.8; display: flex; align-items: center; gap: 5px; margin-top: 1px; }
  .status-dot  {
    width: 7px; height: 7px;
    background: #7CFC00;
    border-radius: 50%;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%,100% { opacity: 1; } 50% { opacity: 0.5; }
  }
  .chat-close {
    background: none; border: none; color: white;
    font-size: 16px; cursor: pointer; opacity: 0.7;
    width: 28px; height: 28px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    transition: opacity 0.15s, background 0.15s;
  }
  .chat-close:hover { opacity: 1; background: rgba(255,255,255,0.15); }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: ${COLORS.surface};
  }
  .chat-messages::-webkit-scrollbar { width: 4px; }
  .chat-messages::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 2px; }

  .msg-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }
  .msg-user { flex-direction: row-reverse; }
  .bot-avatar {
    width: 28px; height: 28px; flex-shrink: 0;
    background: ${COLORS.primary};
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  }
  .msg-bubble {
    max-width: 80%;
    padding: 10px 14px;
    border-radius: 16px;
    font-size: 13.5px;
    line-height: 1.55;
  }
  .bubble-bot  {
    background: white;
    color: ${COLORS.text};
    border-bottom-left-radius: 4px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.07);
  }
  .bubble-user {
    background: ${COLORS.primary};
    color: white;
    border-bottom-right-radius: 4px;
  }
  .bubble-error {
    background: #FFF3F3;
    border: 1px solid #FFCCCC;
  }
  .msg-content p { margin: 0; }
  .msg-content p + p { margin-top: 4px; }

  .msg-sources {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .source-tag {
    font-size: 11px;
    padding: 2px 8px;
    background: ${COLORS.surface};
    color: ${COLORS.primary};
    border: 1px solid ${COLORS.border};
    border-radius: 20px;
    text-decoration: none;
    transition: background 0.15s;
  }
  .source-tag:hover { background: ${COLORS.border}; }

  .msg-suggestions {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .suggestion-btn {
    font-size: 12px;
    padding: 5px 10px;
    background: ${COLORS.surface};
    color: ${COLORS.primary};
    border: 1px solid ${COLORS.border};
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }
  .suggestion-btn:hover { background: #E8F0E0; }

  .typing-bubble {
    display: flex; align-items: center; gap: 5px;
    padding: 12px 16px;
  }
  .typing-bubble span {
    width: 7px; height: 7px;
    background: ${COLORS.textMuted};
    border-radius: 50%;
    animation: bounce 1.2s infinite;
  }
  .typing-bubble span:nth-child(2) { animation-delay: 0.2s; }
  .typing-bubble span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce {
    0%,60%,100% { transform: translateY(0); }
    30%          { transform: translateY(-6px); }
  }

  .chat-quick-actions {
    padding: 8px 12px;
    display: flex;
    gap: 6px;
    background: white;
    border-top: 1px solid ${COLORS.border};
    overflow-x: auto;
    flex-shrink: 0;
  }
  .chat-quick-actions::-webkit-scrollbar { display: none; }
  .quick-action-btn {
    flex-shrink: 0;
    padding: 5px 12px;
    font-size: 12.5px;
    background: ${COLORS.surface};
    color: ${COLORS.text};
    border: 1px solid ${COLORS.border};
    border-radius: 20px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s;
  }
  .quick-action-btn:hover:not(:disabled) {
    background: #E8F0E0;
    border-color: ${COLORS.primary};
    color: ${COLORS.primary};
  }
  .quick-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .chat-input-row {
    padding: 10px 12px;
    display: flex;
    gap: 8px;
    background: white;
    border-top: 1px solid ${COLORS.border};
    flex-shrink: 0;
  }
  .chat-input {
    flex: 1;
    padding: 9px 14px;
    border: 1.5px solid ${COLORS.border};
    border-radius: 24px;
    font-size: 13.5px;
    outline: none;
    transition: border-color 0.15s;
    color: ${COLORS.text};
    background: ${COLORS.surface};
  }
  .chat-input:focus { border-color: ${COLORS.primary}; background: white; }
  .chat-input::placeholder { color: ${COLORS.textMuted}; }
  .chat-send {
    width: 38px; height: 38px;
    background: ${COLORS.primary};
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s, transform 0.1s;
  }
  .chat-send:hover:not(:disabled) {
    background: ${COLORS.primaryMid};
    transform: scale(1.05);
  }
  .chat-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

  @media (max-width: 480px) {
    .chat-window {
      width: 100vw; height: 100dvh;
      bottom: 0; right: 0;
      border-radius: 0;
    }
  }
`;
