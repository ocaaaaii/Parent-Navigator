"""
download_pdfs.py — 育兒導航知識庫 PDF 自動下載器
執行方式：python pdfs/download_pdfs.py
"""

import os
import time
import requests

SAVE_DIR = os.path.dirname(os.path.abspath(__file__))  # 存在 pdfs/ 資料夾

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/pdf,*/*",
}

# ── PDF 來源清單 ──────────────────────────────────────────────────────────────
PDF_SOURCES = [
    # ── 全國 疫苗 ──
    {
        "filename": "全國_兒童預防接種時程表.pdf",
        "url": "https://www.hpa.gov.tw/File/Attach/10760/File_12348.pdf",
        "desc": "國民健康署：兒童預防接種時程及紀錄表",
    },
    {
        "filename": "全國_兒童常規疫苗接種補助計畫_115年.pdf",
        "url": "https://www.nhi.gov.tw/ch/dl-87528-70125c823d4c49e4a0c45348d7be75fd-1.pdf",
        "desc": "衛福部健保署：兒童常規疫苗接種處置費補助作業計畫（115年7月版）",
    },
    {
        "filename": "全國_疫苗接種補助計畫_115年1月.pdf",
        "url": "https://health.tainan.gov.tw/warehouse/502FA77D-78FB-4A16-9B78-A4A11D9189DF/F_1768544914747e.pdf",
        "desc": "疾管署：兒童常規疫苗、流感疫苗接種處置費補助作業計畫（115年1月更新）",
    },
    {
        "filename": "全國_新生兒接種時程_新竹縣.pdf",
        "url": "https://dep.hcchb.gov.tw/uploaddowndoc?file=announcement%2F202506171757450.pdf&filedisplay=%E9%99%84%E4%BB%B61-%E7%8F%BE%E8%A1%8C%E9%A0%90%E9%98%B2%E6%8E%A5%E7%A8%AE%E6%99%82%E7%A8%8B%E8%A1%A8%E8%88%87%E9%96%93%E9%9A%94%E8%A3%9C%E7%A8%AE%E6%8C%87%E5%BC%95.pdf&flag=doc",
        "desc": "114年兒童預防接種時程表與間隔補種指引（新竹縣衛生局）",
    },
    # ── 全國 政策彙整 ──
    {
        "filename": "全國_2026重大育兒惠民政策.pdf",
        "url": "https://www.ey.gov.tw/File/7BD35B48313775F0?A=C",
        "desc": "行政院：2026年元月起實施之重大政策及惠民措施（含育兒相關）",
    },
    # ── 台北市 ──
    {
        "filename": "台北市_育兒補助政策總覽.pdf",
        "url": "https://www-ws.gov.taipei/Download.ashx?u=LzAwMS9VcGxvYWQvMzgyL3JlbGZpbGUvNjI3NzYvOTMzNjYyNS9lNzU2YzkyMi0yNDJmLTQ1ZDEtYmFjNi1lZmNjYmYzNDk4NmYucGRm&n=6Kit57GN6Ie65YyX5biC55u46Zec56aP5Yip5pS%2F562W5LiA6Ka96KGoLnBkZg%3D%3D&icon=..pdf",
        "desc": "台北市政府：育兒補助政策總覽一覽表（民政局）",
    },
    # ── 手動補充欄位（自行從下方網址另存PDF後，重命名放入此資料夾）──
    # born.taipei 檔案下載區：https://born.taipei/cp.aspx?n=EE8E96EBC7CD69A3
    # 勞動部育嬰留職停薪申請書：https://www.bli.gov.tw/0015022.html
]

# ── 下載邏輯 ─────────────────────────────────────────────────────────────────
def download(item: dict) -> bool:
    save_path = os.path.join(SAVE_DIR, item["filename"])
    if os.path.exists(save_path) and os.path.getsize(save_path) > 10_000:
        print(f"  ⏭  已存在，跳過：{item['filename']}")
        return True

    print(f"  ⬇  {item['desc']}")
    print(f"     URL: {item['url'][:80]}...")
    try:
        resp = requests.get(item["url"], headers=HEADERS, timeout=30, stream=True)
        resp.raise_for_status()
        with open(save_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        size = os.path.getsize(save_path)
        if size < 5_000:
            os.remove(save_path)
            print(f"     ❌ 下載失敗（檔案太小：{size} bytes，可能需要手動下載）")
            return False
        print(f"     ✅ 成功 ({size/1024:.0f} KB) → {item['filename']}")
        return True
    except Exception as e:
        print(f"     ❌ 錯誤：{e}")
        if os.path.exists(save_path):
            os.remove(save_path)
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("育兒導航 PDF 知識庫下載器")
    print(f"儲存位置：{SAVE_DIR}")
    print("=" * 60)

    ok, fail = 0, 0
    for item in PDF_SOURCES:
        print(f"\n[{item['filename']}]")
        if download(item):
            ok += 1
        else:
            fail += 1
        time.sleep(1.5)  # 避免對政府網站造成過大請求壓力

    print("\n" + "=" * 60)
    print(f"完成！成功：{ok} 個，失敗：{fail} 個")
    if fail:
        print("\n⚠️  部分 PDF 可能需要手動下載，請參考以下網址：")
        print("  - born.taipei 助您好孕：https://born.taipei/cp.aspx?n=EE8E96EBC7CD69A3")
        print("  - 勞動部申請書：https://www.bli.gov.tw/0015022.html")
        print("  - 疾管署疫苗資料：https://www.cdc.gov.tw")
    print("=" * 60)
    print("\n下載完成後，執行以下指令將 PDF 向量化進知識庫：")
    print("  cd backend && python wiki_loader.py --rebuild")
