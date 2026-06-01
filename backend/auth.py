# auth.py — 網頁版使用者登入系統
# Flask-Login + bcrypt session 管理
# 路由前綴：/auth

import logging
import re
from functools import wraps

import bcrypt
from flask import Blueprint, request, jsonify, session

import db

logger   = logging.getLogger(__name__)
auth_bp  = Blueprint("auth", __name__, url_prefix="/auth")

# ── 密碼規則 ───────────────────────────────────────────────────────────────────
MIN_PASSWORD_LEN = 8
USERNAME_RE      = re.compile(r"^[\w一-鿿]{2,20}$")  # 2~20 字，中英文數字底線

# ── Session Key ───────────────────────────────────────────────────────────────
SESSION_USER_KEY = "web_user_id"


# ── 工具：密碼雜湊 ────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


def check_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── 工具：登入狀態 Decorator ──────────────────────────────────────────────────

def login_required(f):
    """裝飾器：API 需要登入才能呼叫，否則回傳 401。"""
    @wraps(f)
    def decorated(*args, **kwargs):
        if SESSION_USER_KEY not in session:
            return jsonify({"error": "請先登入", "code": "UNAUTHORIZED"}), 401
        return f(*args, **kwargs)
    return decorated


def get_current_user() -> dict | None:
    """取得目前 session 的使用者資料，未登入回傳 None。"""
    uid = session.get(SESSION_USER_KEY)
    if not uid:
        return None
    sql = """
        SELECT web_user_id, username, email, avatar_url, bio, city, role, created_at
        FROM web_users
        WHERE web_user_id = %s AND is_active = 1
    """
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (uid,))
            return cur.fetchone()


# ── 路由 ──────────────────────────────────────────────────────────────────────

@auth_bp.route("/register", methods=["POST"])
def register():
    """
    POST /auth/register
    Body: { "username": "...", "email": "...", "password": "..." }
    """
    data     = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email    = (data.get("email")    or "").strip().lower()
    password = (data.get("password") or "")

    # ── 驗證 ──────────────────────────────────────────────────────────────────
    errors = []
    if not USERNAME_RE.match(username):
        errors.append("暱稱需 2~20 個字元（中英文、數字、底線）")
    if not re.match(r"^[^@]+@[^@]+\.[^@]+$", email):
        errors.append("Email 格式不正確")
    if len(password) < MIN_PASSWORD_LEN:
        errors.append(f"密碼至少需要 {MIN_PASSWORD_LEN} 個字元")
    if errors:
        return jsonify({"error": "；".join(errors)}), 400

    # ── 檢查重複 ──────────────────────────────────────────────────────────────
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT web_user_id FROM web_users WHERE email = %s OR username = %s",
                        (email, username))
            if cur.fetchone():
                return jsonify({"error": "Email 或暱稱已被使用"}), 409

    # ── 建立帳號 ──────────────────────────────────────────────────────────────
    pw_hash = hash_password(password)
    sql = """
        INSERT INTO web_users (username, email, password_hash)
        VALUES (%s, %s, %s)
    """
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (username, email, pw_hash))
            new_id = cur.lastrowid
        conn.commit()

    # 自動登入
    session[SESSION_USER_KEY] = new_id
    session.permanent = True
    logger.info("新用戶註冊：%s (%s)", username, email)

    return jsonify({
        "message":  "註冊成功！",
        "user_id":  new_id,
        "username": username,
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    POST /auth/login
    Body: { "email": "...", "password": "..." }
    """
    data     = request.get_json(silent=True) or {}
    email    = (data.get("email")    or "").strip().lower()
    password = (data.get("password") or "")

    if not email or not password:
        return jsonify({"error": "請輸入 Email 和密碼"}), 400

    sql = "SELECT web_user_id, username, password_hash, is_active FROM web_users WHERE email = %s"
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (email,))
            user = cur.fetchone()

    if not user or not check_password(password, user["password_hash"]):
        return jsonify({"error": "Email 或密碼錯誤"}), 401

    if not user["is_active"]:
        return jsonify({"error": "帳號已被停用，請聯繫管理員"}), 403

    # 更新最後登入時間
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE web_users SET last_login = NOW() WHERE web_user_id = %s",
                        (user["web_user_id"],))
        conn.commit()

    session[SESSION_USER_KEY] = user["web_user_id"]
    session.permanent = True
    logger.info("用戶登入：%s", email)

    return jsonify({
        "message":  "登入成功！",
        "user_id":  user["web_user_id"],
        "username": user["username"],
    })


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """POST /auth/logout"""
    session.pop(SESSION_USER_KEY, None)
    return jsonify({"message": "已登出"})


@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    """GET /auth/me — 取得目前登入使用者資料"""
    user = get_current_user()
    if not user:
        return jsonify({"error": "找不到使用者"}), 404
    # 不回傳密碼 hash
    user.pop("password_hash", None)
    return jsonify(user)


@auth_bp.route("/me", methods=["PATCH"])
@login_required
def update_profile():
    """
    PATCH /auth/me — 更新個人資料
    Body: { "bio": "...", "city": "台北市", "avatar_url": "..." }
    """
    uid  = session[SESSION_USER_KEY]
    data = request.get_json(silent=True) or {}

    allowed = {"bio": 200, "city": 20, "avatar_url": 255}
    updates = {}
    for field, max_len in allowed.items():
        if field in data:
            val = str(data[field])[:max_len]
            updates[field] = val

    if not updates:
        return jsonify({"error": "沒有可更新的欄位"}), 400

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    sql = f"UPDATE web_users SET {set_clause} WHERE web_user_id = %s"

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (*updates.values(), uid))
        conn.commit()

    return jsonify({"message": "個人資料已更新"})
