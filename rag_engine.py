"""
RAG Engine - 育兒知識庫的大腦
負責：文件載入、向量化、語意檢索、LLM 生成回答
"""

import os
import re
from typing import Optional
import chromadb
from chromadb.utils import embedding_functions
from anthropic import Anthropic   # pip install anthropic
# from openai import OpenAI       # 若改用 OpenAI，取消此行注釋

# ---- 設定 ----
CHROMA_PATH   = "./chroma_db"
COLLECTION    = "parenting_knowledge"
LLM_MODEL     = "claude-sonnet-4-20250514"
EMBED_MODEL   = "text-embedding-3-small"   # OpenAI embedding（便宜又夠用）
TOP_K         = 5                           # 每次檢索取幾個最相關的 chunk


SYSTEM_PROMPT = """你是「育兒小幫手 AI」，一個專門服務台灣新手爸媽的智慧助手。

你的知識涵蓋：
- 政府育兒補助（育兒津貼、生育獎勵、托育補助等）
- 兒童疫苗接種時程
- 公共托育、私立托嬰中心資訊
- 兒童健康檢查
- 育嬰留職停薪相關規定

回答原則：
1. 使用繁體中文，語氣親切、像鄰家姊姊/哥哥
2. 優先使用「知識庫內容」回答，並在結尾附上「資料來源」
3. 若知識庫找不到答案，請誠實說明並建議諮詢管道（如：1957 福利諮詢專線）
4. 回答要具體實用，例如「準備哪些文件」、「去哪裡辦」
5. 若問題涉及特定縣市，請注意各縣市補助金額可能不同

⚠️ 重要：不要捏造資訊，有疑慮的數字請建議使用者確認官方最新公告。
"""


class RAGEngine:
    def __init__(self):
        # 初始化 ChromaDB（本地儲存，不需要外部服務）
        self.client = chromadb.PersistentClient(path=CHROMA_PATH)

        # 使用 OpenAI Embedding（也可換成 sentence-transformers 完全免費）
        self.embed_fn = embedding_functions.OpenAIEmbeddingFunction(
            api_key=os.getenv("OPENAI_API_KEY"),
            model_name=EMBED_MODEL,
        )

        self.collection = self.client.get_or_create_collection(
            name=COLLECTION,
            embedding_function=self.embed_fn,
            metadata={"hnsw:space": "cosine"},
        )

        # LLM 客戶端
        self.llm = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

        print(f"✅ RAG Engine 啟動，知識庫共 {self.collection.count()} 個 chunk")

    # ------------------------------------------------------------------
    # 主要查詢入口
    # ------------------------------------------------------------------

    async def query(
        self,
        question: str,
        city_filter: Optional[str] = None,
        session_id: str = "default",
    ) -> dict:
        """
        完整 RAG 流程：
        1. 語意檢索相關 chunk
        2. 組合 prompt
        3. 呼叫 LLM 生成回答
        4. 返回答案 + 來源 + 建議問題
        """

        # Step 1: 向量檢索
        chunks = self._retrieve(question, city_filter)

        if not chunks:
            # 知識庫完全找不到相關資料
            return {
                "answer": "抱歉，我的知識庫目前還沒有涵蓋這個問題的相關資訊。\n\n建議您：\n• 撥打 **1957** 福利諮詢專線\n• 至衛福部官網查詢最新公告",
                "sources": [],
                "suggested_questions": self._default_suggestions(),
            }

        # Step 2: 組合 context
        context = self._build_context(chunks)

        # Step 3: 呼叫 LLM
        answer = self._generate(question, context)

        # Step 4: 組裝回傳
        sources = self._format_sources(chunks)
        suggested = self._generate_suggestions(question, answer)

        return {
            "answer": answer,
            "sources": sources,
            "suggested_questions": suggested,
        }

    # ------------------------------------------------------------------
    # 文件攝入（建庫時使用）
    # ------------------------------------------------------------------

    def ingest_markdown_folder(self, folder_path: str):
        """
        讀取 Wiki_Pages/ 資料夾的所有 .md 檔案，切 chunk 後存入 ChromaDB
        建議在資料準備完後執行一次：python -c "from rag_engine import RAGEngine; RAGEngine().ingest_markdown_folder('./data/wiki_pages')"
        """
        import os
        md_files = [f for f in os.listdir(folder_path) if f.endswith(".md")]
        total = 0

        for filename in md_files:
            filepath = os.path.join(folder_path, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()

            # 解析 frontmatter metadata
            meta = self._parse_frontmatter(content, filename)

            # 切 chunk
            chunks = self._chunk_markdown(content, meta)

            # 批次存入 ChromaDB
            if chunks:
                self.collection.upsert(
                    ids=[c["id"] for c in chunks],
                    documents=[c["text"] for c in chunks],
                    metadatas=[c["meta"] for c in chunks],
                )
                total += len(chunks)
                print(f"  📄 {filename} → {len(chunks)} chunks")

        print(f"\n✅ 攝入完成！共 {total} 個 chunk 存入向量庫")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _retrieve(self, question: str, city_filter: Optional[str]) -> list:
        """語意檢索，支援縣市過濾"""
        where_clause = {}
        if city_filter:
            # 同時撈全國 + 指定縣市
            where_clause = {
                "$or": [
                    {"city": {"$eq": city_filter}},
                    {"city": {"$eq": "全國"}},
                ]
            }

        results = self.collection.query(
            query_texts=[question],
            n_results=TOP_K,
            where=where_clause if where_clause else None,
            include=["documents", "metadatas", "distances"],
        )

        chunks = []
        for i, doc in enumerate(results["documents"][0]):
            distance = results["distances"][0][i]
            # 過濾掉相關性太低的結果（cosine distance > 0.5 代表不太相關）
            if distance < 0.5:
                chunks.append({
                    "text": doc,
                    "meta": results["metadatas"][0][i],
                    "score": round(1 - distance, 3),
                })

        return chunks

    def _build_context(self, chunks: list) -> str:
        """組合 context 給 LLM"""
        parts = []
        for i, c in enumerate(chunks, 1):
            source_label = c["meta"].get("source_title", "政府文件")
            city_label   = c["meta"].get("city", "全國")
            parts.append(f"[來源 {i}：{source_label}（{city_label}）]\n{c['text']}")
        return "\n\n---\n\n".join(parts)

    def _generate(self, question: str, context: str) -> str:
        """呼叫 Claude 生成回答"""
        user_prompt = f"""根據以下知識庫內容回答問題：

=== 知識庫內容 ===
{context}

=== 使用者問題 ===
{question}

請依據上方知識庫內容回答，回答結尾請以「📌 資料來源：」標示使用了哪些來源。"""

        response = self.llm.messages.create(
            model=LLM_MODEL,
            max_tokens=1000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return response.content[0].text

    def _generate_suggestions(self, question: str, answer: str) -> list[str]:
        """根據問答內容，讓 LLM 生成 3 個後續建議問題"""
        prompt = f"""使用者剛才問了：「{question}」
你回答了關於育兒補助/醫療的相關資訊。

請生成 3 個使用者可能會繼續問的相關問題，要具體實用。
格式：只輸出 3 行問題文字，不要編號，不要其他說明。"""

        response = self.llm.messages.create(
            model=LLM_MODEL,
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        lines = response.content[0].text.strip().split("\n")
        return [l.strip() for l in lines if l.strip()][:3]

    def _format_sources(self, chunks: list) -> list[dict]:
        seen = set()
        sources = []
        for c in chunks:
            title = c["meta"].get("source_title", "政府文件")
            url   = c["meta"].get("source_url", "")
            if title not in seen:
                seen.add(title)
                sources.append({"title": title, "url": url, "relevance": c["score"]})
        return sources

    def _parse_frontmatter(self, content: str, filename: str) -> dict:
        """解析 Markdown YAML frontmatter"""
        meta = {"filename": filename, "city": "全國", "source_title": filename.replace(".md", "")}
        match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
        if match:
            for line in match.group(1).split("\n"):
                if "適用縣市:" in line:
                    meta["city"] = line.split(":", 1)[1].strip()
                if "source_title:" in line:
                    meta["source_title"] = line.split(":", 1)[1].strip()
                if "source_url:" in line:
                    meta["source_url"] = line.split(":", 1)[1].strip()
        return meta

    def _chunk_markdown(self, content: str, meta: dict, chunk_size: int = 500) -> list:
        """
        按 ## 標題切 chunk（比固定字數切更語意完整）
        每個 chunk 最多 500 字，超過的再依句子切
        """
        # 移除 frontmatter
        content = re.sub(r"^---\n.*?\n---\n", "", content, flags=re.DOTALL)

        sections = re.split(r"\n(?=## )", content)
        chunks = []

        for section in sections:
            section = section.strip()
            if not section:
                continue

            if len(section) <= chunk_size:
                chunk_id = f"{meta['filename']}_{len(chunks)}"
                chunks.append({"id": chunk_id, "text": section, "meta": meta})
            else:
                # 超過 500 字，再切小塊
                sentences = re.split(r"(?<=[。！？\n])", section)
                current, current_len = [], 0
                for sent in sentences:
                    if current_len + len(sent) > chunk_size and current:
                        chunk_id = f"{meta['filename']}_{len(chunks)}"
                        chunks.append({"id": chunk_id, "text": "".join(current), "meta": meta})
                        current, current_len = [], 0
                    current.append(sent)
                    current_len += len(sent)
                if current:
                    chunk_id = f"{meta['filename']}_{len(chunks)}"
                    chunks.append({"id": chunk_id, "text": "".join(current), "meta": meta})

        return chunks

    def _default_suggestions(self) -> list[str]:
        return [
            "育兒津貼怎麼申請？需要準備什麼文件？",
            "寶寶出生後第一年要打哪些疫苗？",
            "公共托育名額怎麼查詢？",
        ]
