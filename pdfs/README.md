# pdfs/ — 政府 PDF 原始文件存放區

本資料夾用於存放從政府網站爬取的原始 PDF 檔案。

## 命名規則

```
縣市_主題.pdf
```

例如：
- `台北市_育兒補助懶人包.pdf`
- `全國_公費疫苗接種時程表.pdf`

## 使用說明

- PDF 由 `crawler.py` 自動下載，或由人工放置
- `wiki_loader.py` 使用 `pdfplumber` 讀取全文，自動轉成向量化 chunk
- 每份 PDF 的**原始政府來源 URL** 記錄在對應的 `.md` Wiki 檔案的 `來源` 欄位中

## 重要原則

爬取到的 PDF 僅做本地知識庫索引用途，RAG 系統回覆時會附上原始政府來源連結，確保用戶能看到最新的官方版本。

## 目前已知 PDF 來源

| 主題 | 來源網址 |
|------|----------|
| 新生兒聽力篩檢補助服務方案 | https://health.tainan.gov.tw/lasthealthweb/warehouse/... |
| 公費疫苗接種時程表 | https://www.cdc.gov.tw |
| 台北市生育補助懶人包 | https://born.taipei |

> 爬蟲執行後，新下載的 PDF 會自動出現在此資料夾，並由 `wiki_loader.py --rebuild` 重新向量化。
