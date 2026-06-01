"""
時序推播服務 - 根據寶寶生日計算提醒清單
對應 MySQL 育兒里程碑時序表
"""

from datetime import date, datetime
from dateutil.relativedelta import relativedelta   # pip install python-dateutil


# ---- 靜態時序表（未來從 MySQL 讀取）----
# 格式：{"trigger_months": int, "type": str, "title": str, "description": str, "action": str}
MILESTONES = [
    # 疫苗
    {"trigger_months": 0,  "type": "vaccine", "title": "B型肝炎疫苗（第1劑）",    "description": "出生後 24 小時內接種",                              "action": "請聯絡出生醫院"},
    {"trigger_months": 1,  "type": "vaccine", "title": "B型肝炎疫苗（第2劑）",    "description": "出生後 1 個月接種",                                  "action": "至合約醫療院所"},
    {"trigger_months": 2,  "type": "vaccine", "title": "五合一疫苗（第1劑）",     "description": "DTaP-IPV-Hib，出生後 2 個月",                        "action": "至衛生所或合約診所"},
    {"trigger_months": 2,  "type": "vaccine", "title": "肺炎鏈球菌疫苗（第1劑）", "description": "PCV13，出生後 2 個月",                               "action": "至衛生所或合約診所"},
    {"trigger_months": 4,  "type": "vaccine", "title": "五合一疫苗（第2劑）",     "description": "出生後 4 個月",                                      "action": "至衛生所或合約診所"},
    {"trigger_months": 5,  "type": "vaccine", "title": "卡介苗",                  "description": "出生後 5 個月內接種",                                "action": "至衛生所"},
    {"trigger_months": 6,  "type": "vaccine", "title": "五合一疫苗（第3劑）",     "description": "出生後 6 個月",                                      "action": "至衛生所或合約診所"},
    {"trigger_months": 6,  "type": "vaccine", "title": "B型肝炎疫苗（第3劑）",    "description": "出生後 6 個月",                                      "action": "至衛生所或合約診所"},
    {"trigger_months": 12, "type": "vaccine", "title": "MMR 疫苗（第1劑）",       "description": "滿 1 歲接種麻疹、腮腺炎、德國麻疹混合疫苗",         "action": "至衛生所或合約診所"},
    {"trigger_months": 12, "type": "vaccine", "title": "水痘疫苗",                "description": "滿 1 歲接種",                                        "action": "至衛生所或合約診所"},
    # 健康檢查
    {"trigger_months": 1,  "type": "checkup", "title": "新生兒聽力篩檢",          "description": "出生後 1 個月內完成",                                "action": "至醫療院所"},
    {"trigger_months": 2,  "type": "checkup", "title": "第1次兒童預防保健",       "description": "1~2 個月健檢（共 7 次免費）",                        "action": "至健保合約醫療機構"},
    {"trigger_months": 4,  "type": "checkup", "title": "第2次兒童預防保健",       "description": "3~6 個月健檢",                                      "action": "至健保合約醫療機構"},
    {"trigger_months": 9,  "type": "checkup", "title": "第3次兒童預防保健",       "description": "6~9 個月健檢",                                      "action": "至健保合約醫療機構"},
    {"trigger_months": 18, "type": "checkup", "title": "第4次兒童預防保健",       "description": "10~18 個月健檢",                                    "action": "至健保合約醫療機構"},
    # 補助申請
    {"trigger_months": 1,  "type": "subsidy", "title": "申請生育獎勵金",          "description": "大多縣市需在出生後 6 個月內申請",                    "action": "至戶籍地區公所"},
    {"trigger_months": 2,  "type": "subsidy", "title": "育兒津貼申請",            "description": "0~2 歲月領 3,500~5,000 元（依縣市不同）",           "action": "至社會局或線上申辦"},
    {"trigger_months": 3,  "type": "subsidy", "title": "申請公共托育名額",        "description": "建議及早登記，名額有限",                             "action": "至縣市托育資源中心"},
    {"trigger_months": 12, "type": "subsidy", "title": "育兒津貼續領確認",        "description": "確認資格是否仍符合，避免中斷",                       "action": "聯絡原申請單位"},
]

# 提前幾天提醒
REMIND_DAYS_BEFORE = 14


class ReminderService:
    def calculate(self, birthday_str: str, city: str) -> list[dict]:
        """
        輸入寶寶生日與縣市，回傳：
        - 已錯過（overdue）
        - 即將到來（upcoming，14天內）
        - 未來（future，最近3個里程碑）
        """
        try:
            birthday = datetime.strptime(birthday_str, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError("birthday 格式錯誤，請使用 YYYY-MM-DD")

        today = date.today()
        child_age_months = self._months_between(birthday, today)

        result = {"overdue": [], "upcoming": [], "future": []}

        for ms in MILESTONES:
            trigger_date = birthday + relativedelta(months=ms["trigger_months"])
            days_until   = (trigger_date - today).days

            item = {
                "title":       ms["title"],
                "type":        ms["type"],
                "trigger_date": trigger_date.strftime("%Y-%m-%d"),
                "description": ms["description"],
                "action":      ms["action"],
                "days_until":  days_until,
            }

            if days_until < -7:
                # 超過 7 天沒做 → 逾期（只保留最近 3 筆）
                result["overdue"].append(item)
            elif days_until <= REMIND_DAYS_BEFORE:
                # 14 天內 → 即將到來
                result["upcoming"].append(item)
            elif len(result["future"]) < 5:
                # 未來事項，最多顯示 5 個
                result["future"].append(item)

        # 逾期只留最近 3 筆
        result["overdue"] = sorted(result["overdue"], key=lambda x: x["days_until"], reverse=True)[:3]
        result["upcoming"] = sorted(result["upcoming"], key=lambda x: x["days_until"])

        # 加入縣市特有補助提示
        result["city_note"] = self._city_specific_note(city, child_age_months)
        result["child_age_months"] = child_age_months

        return result

    def _months_between(self, start: date, end: date) -> int:
        delta = relativedelta(end, start)
        return delta.years * 12 + delta.months

    def _city_specific_note(self, city: str, age_months: int) -> str:
        """各縣市特有補助提示"""
        notes = {
            "台北市": "台北市額外提供：生育獎勵金（第1胎2萬）、幼兒托育補助（每月最高1萬）。",
            "新北市": "新北市額外提供：生育獎勵金、育兒補助，可至新北市社會局查詢最新方案。",
            "桃園市": "桃園市提供生育補助及托育補助，各行政區金額可能不同，請洽社會局。",
        }
        return notes.get(city, f"{city}的補助方案請至當地社會局確認最新資訊。")
