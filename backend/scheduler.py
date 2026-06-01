# scheduler.py — APScheduler 主動推播排程
#
# 架構：
#   - BackgroundScheduler（daemon thread，不阻塞 Flask）
#   - 每日指定時間（預設 09:00 台北時間）執行 daily_push_job()
#   - daily_push_job 查詢 v_today_push，依序發送 LINE Push Message
#   - 失敗自動記錄至 push_schedule.error_message，方便後續追查
#
# 使用方式：
#   from scheduler import init_scheduler
#   scheduler = init_scheduler(line_bot_api)   # 在 app.py 呼叫

import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from linebot.v3.messaging import (
    ApiClient, MessagingApi,
    PushMessageRequest, TextMessage,
    FlexMessage,
)
from linebot.v3.messaging.configuration import Configuration

import config
import db

logger = logging.getLogger(__name__)

# ── 推播訊息格式化 ─────────────────────────────────────────────────────────────

def _format_push_message(row: dict) -> str:
    """
    根據 push_schedule 查詢結果組合推播文字。

    row 欄位：nickname, label, message_template
    message_template 範例：
        "{nickname} 今天滿 {age} 個月囉！記得預約 {label} 哦 🎉"
    """
    template = row.get("message_template") or (
        "📅 育兒提醒\n\n"
        "【{nickname}】{label}\n\n"
        "記得確認相關補助申辦期限，有問題歡迎詢問育兒小幫手！"
    )
    try:
        text = template.format(
            nickname=row.get("nickname", "寶寶"),
            label=row.get("label", ""),
        )
    except KeyError:
        # template 有未知 placeholder 時，降級為純文字
        text = (
            f"📅 育兒提醒\n\n"
            f"【{row.get('nickname','寶寶')}】{row.get('label','')}\n\n"
            "記得確認相關補助申辦期限！"
        )
    return text


# ── 主排程任務 ─────────────────────────────────────────────────────────────────

def daily_push_job(messaging_api: MessagingApi) -> None:
    """
    每日定時執行的推播任務。
    1. 從 MySQL 查詢今日待推播記錄
    2. 逐筆組合訊息並呼叫 LINE Push Message API
    3. 更新 push_schedule 狀態（sent / failed）
    """
    today = datetime.now().strftime("%Y-%m-%d")
    logger.info("[Scheduler] 開始執行每日推播任務 (%s)", today)

    try:
        rows = db.get_today_pushes()
    except Exception as e:
        logger.error("[Scheduler] 讀取今日推播失敗：%s", e)
        return

    if not rows:
        logger.info("[Scheduler] 今日無待推播記錄，結束。")
        return

    success_count = 0
    fail_count    = 0

    for row in rows:
        schedule_id = row["schedule_id"]
        user_id     = row["user_id"]

        try:
            text = _format_push_message(row)

            # LINE Push Message API（v3 SDK）
            messaging_api.push_message(
                PushMessageRequest(
                    to=user_id,
                    messages=[TextMessage(type="text", text=text)],
                )
            )

            db.mark_push_status(schedule_id, "sent")
            success_count += 1
            logger.debug(
                "[Scheduler] 推播成功：schedule_id=%d, user=%s",
                schedule_id, user_id
            )

        except Exception as e:
            err_msg = str(e)[:500]  # 截斷超長錯誤訊息
            db.mark_push_status(schedule_id, "failed", error_msg=err_msg)
            fail_count += 1
            logger.error(
                "[Scheduler] 推播失敗：schedule_id=%d, user=%s, error=%s",
                schedule_id, user_id, err_msg
            )

    logger.info(
        "[Scheduler] 每日推播完成：成功 %d 筆 / 失敗 %d 筆",
        success_count, fail_count
    )


# ── Scheduler 初始化 ───────────────────────────────────────────────────────────

def init_scheduler(messaging_api: MessagingApi) -> BackgroundScheduler:
    """
    初始化並啟動 APScheduler。
    在 Flask app 啟動時呼叫，傳入 LINE messaging_api 實例。

    使用範例（app.py）：
        from scheduler import init_scheduler
        scheduler = init_scheduler(messaging_api)
        # Flask 關閉時自動呼叫 scheduler.shutdown()

    Returns:
        BackgroundScheduler（已 start()）
    """
    scheduler = BackgroundScheduler(
        timezone=config.SCHEDULER_TIMEZONE,
        # 避免 APScheduler 佔用太多 log
        job_defaults={"coalesce": True, "max_instances": 1},
    )

    # 每週一 02:00 自動爬蟲更新知識庫
    from crawler import crawl_all_targets
    scheduler.add_job(
        func=crawl_all_targets,
        trigger=CronTrigger(
            day_of_week="mon",
            hour=2,
            minute=0,
            timezone=config.SCHEDULER_TIMEZONE,
        ),
        id="weekly_crawl",
        name="每週知識庫自動更新",
        replace_existing=True,
    )

    # 每日定時推播
    scheduler.add_job(
        func=daily_push_job,
        trigger=CronTrigger(
            hour=config.SCHEDULER_PUSH_HOUR,
            minute=config.SCHEDULER_PUSH_MINUTE,
            timezone=config.SCHEDULER_TIMEZONE,
        ),
        args=[messaging_api],
        id="daily_push",
        name="每日育兒提醒推播",
        replace_existing=True,
    )

    # 開發/測試用：可臨時加入立即執行任務
    # scheduler.add_job(daily_push_job, 'date', args=[messaging_api],
    #                   run_date=datetime.now())

    scheduler.start()
    logger.info(
        "[Scheduler] 啟動完成，每日 %02d:%02d (%s) 執行推播",
        config.SCHEDULER_PUSH_HOUR,
        config.SCHEDULER_PUSH_MINUTE,
        config.SCHEDULER_TIMEZONE,
    )
    return scheduler
