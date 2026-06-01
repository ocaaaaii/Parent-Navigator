# forum.py — 論壇 API（Dcard/PTT 風格）
# 路由前綴：/forum
#
# 功能：
#   - 5 大板塊分類（補助討論、寶寶健康、托育分享、新手問答、生活日常）
#   - 發文 / 編輯 / 刪除（軟刪除）
#   - 留言 / 巢狀回覆 / 刪除
#   - 按讚（貼文 + 留言）
#   - 熱門 / 最新 / 板塊 列表
#   - 可選匿名發文

import logging
from flask import Blueprint, request, jsonify, session

import db
from auth import login_required, get_current_user, SESSION_USER_KEY

logger   = logging.getLogger(__name__)
forum_bp = Blueprint("forum", __name__, url_prefix="/forum")

MAX_TITLE_LEN   = 100
MAX_CONTENT_LEN = 5000
MAX_COMMENT_LEN = 1000
PAGE_SIZE       = 20


# ── 板塊 ──────────────────────────────────────────────────────────────────────

@forum_bp.route("/categories", methods=["GET"])
def get_categories():
    """GET /forum/categories — 取得所有板塊"""
    sql = """
        SELECT c.category_id, c.name, c.slug, c.description, c.icon, c.color,
               COUNT(p.post_id) AS post_count
        FROM forum_categories c
        LEFT JOIN forum_posts p ON p.category_id = c.category_id AND p.is_deleted = 0
        WHERE c.is_active = 1
        GROUP BY c.category_id
        ORDER BY c.sort_order
    """
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            cats = cur.fetchall()
    return jsonify(cats)


# ── 貼文列表 ─────────────────────────────────────────────────────────────────

@forum_bp.route("/posts", methods=["GET"])
def list_posts():
    """
    GET /forum/posts
    Query params:
        category: slug 名稱（可選）
        sort:     hot | new（預設 new）
        page:     頁數（從 1 開始）
    """
    category_slug = request.args.get("category")
    sort          = request.args.get("sort", "new")
    page          = max(1, int(request.args.get("page", 1)))
    offset        = (page - 1) * PAGE_SIZE

    where  = ["p.is_deleted = 0"]
    params = []

    if category_slug:
        where.append("c.slug = %s")
        params.append(category_slug)

    order_by = (
        "(p.like_count * 3 + p.comment_count * 2 + p.view_count) DESC, p.created_at DESC"
        if sort == "hot" else "p.created_at DESC"
    )

    sql = f"""
        SELECT
            p.post_id,
            p.title,
            LEFT(p.content, 120) AS preview,
            p.like_count,
            p.comment_count,
            p.view_count,
            p.is_pinned,
            p.is_anonymous,
            p.created_at,
            c.name  AS category_name,
            c.icon  AS category_icon,
            c.color AS category_color,
            c.slug  AS category_slug,
            CASE WHEN p.is_anonymous = 1 THEN '匿名用戶' ELSE u.username END AS author_name,
            CASE WHEN p.is_anonymous = 1 THEN NULL ELSE u.avatar_url END AS author_avatar
        FROM forum_posts p
        JOIN forum_categories c ON p.category_id = c.category_id
        JOIN web_users        u ON p.web_user_id  = u.web_user_id
        WHERE {' AND '.join(where)}
        ORDER BY p.is_pinned DESC, {order_by}
        LIMIT %s OFFSET %s
    """
    params += [PAGE_SIZE, offset]

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            posts = cur.fetchall()

    return jsonify({"posts": posts, "page": page, "page_size": PAGE_SIZE})


# ── 單篇貼文 ─────────────────────────────────────────────────────────────────

@forum_bp.route("/posts/<int:post_id>", methods=["GET"])
def get_post(post_id: int):
    """GET /forum/posts/<post_id> — 取得單篇貼文（含留言）"""
    # 增加瀏覽數
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE forum_posts SET view_count = view_count + 1 WHERE post_id = %s",
                        (post_id,))
        conn.commit()

    sql_post = """
        SELECT
            p.post_id, p.title, p.content, p.image_url,
            p.like_count, p.comment_count, p.view_count,
            p.is_pinned, p.is_anonymous, p.created_at, p.updated_at,
            c.name AS category_name, c.icon AS category_icon, c.slug AS category_slug,
            CASE WHEN p.is_anonymous = 1 THEN '匿名用戶' ELSE u.username END AS author_name,
            CASE WHEN p.is_anonymous = 1 THEN NULL ELSE u.avatar_url END AS author_avatar,
            CASE WHEN p.is_anonymous = 1 THEN NULL ELSE p.web_user_id END AS author_id
        FROM forum_posts p
        JOIN forum_categories c ON p.category_id = c.category_id
        JOIN web_users        u ON p.web_user_id  = u.web_user_id
        WHERE p.post_id = %s AND p.is_deleted = 0
    """
    sql_comments = """
        SELECT
            cm.comment_id, cm.parent_id, cm.content, cm.like_count,
            cm.is_anonymous, cm.created_at,
            CASE WHEN cm.is_anonymous = 1 THEN '匿名用戶' ELSE u.username END AS author_name,
            CASE WHEN cm.is_anonymous = 1 THEN NULL ELSE u.avatar_url END AS author_avatar
        FROM forum_comments cm
        JOIN web_users u ON cm.web_user_id = u.web_user_id
        WHERE cm.post_id = %s AND cm.is_deleted = 0
        ORDER BY cm.created_at
    """
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql_post, (post_id,))
            post = cur.fetchone()
            if not post:
                return jsonify({"error": "貼文不存在"}), 404
            cur.execute(sql_comments, (post_id,))
            comments = cur.fetchall()

    # 檢查目前使用者是否已按讚
    uid = session.get(SESSION_USER_KEY)
    liked = False
    if uid:
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM post_likes WHERE post_id=%s AND web_user_id=%s",
                    (post_id, uid)
                )
                liked = cur.fetchone() is not None

    post["comments"] = comments
    post["viewer_liked"] = liked
    return jsonify(post)


# ── 發文 ──────────────────────────────────────────────────────────────────────

@forum_bp.route("/posts", methods=["POST"])
@login_required
def create_post():
    """
    POST /forum/posts
    Body: { "category_slug": "subsidy", "title": "...", "content": "...",
            "is_anonymous": false, "image_url": "..." }
    """
    uid  = session[SESSION_USER_KEY]
    data = request.get_json(silent=True) or {}

    title         = (data.get("title")   or "").strip()[:MAX_TITLE_LEN]
    content       = (data.get("content") or "").strip()[:MAX_CONTENT_LEN]
    category_slug = (data.get("category_slug") or "").strip()
    is_anonymous  = bool(data.get("is_anonymous", False))
    image_url     = (data.get("image_url") or "")[:255]

    if not title:
        return jsonify({"error": "標題不能為空"}), 400
    if len(content) < 10:
        return jsonify({"error": "內容至少需要 10 個字"}), 400

    # 查詢 category_id
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT category_id FROM forum_categories WHERE slug = %s AND is_active = 1",
                        (category_slug,))
            cat = cur.fetchone()
    if not cat:
        return jsonify({"error": "板塊不存在"}), 400

    sql = """
        INSERT INTO forum_posts
            (category_id, web_user_id, title, content, image_url, is_anonymous)
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (cat["category_id"], uid, title, content,
                              image_url or None, int(is_anonymous)))
            post_id = cur.lastrowid
        conn.commit()

    logger.info("新貼文：post_id=%d, user_id=%d, category=%s", post_id, uid, category_slug)
    return jsonify({"message": "發文成功", "post_id": post_id}), 201


@forum_bp.route("/posts/<int:post_id>", methods=["DELETE"])
@login_required
def delete_post(post_id: int):
    """DELETE /forum/posts/<post_id> — 軟刪除（作者或 moderator）"""
    uid = session[SESSION_USER_KEY]
    user = get_current_user()

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT web_user_id FROM forum_posts WHERE post_id = %s AND is_deleted = 0",
                        (post_id,))
            post = cur.fetchone()
    if not post:
        return jsonify({"error": "貼文不存在"}), 404
    if post["web_user_id"] != uid and user.get("role") not in ("moderator", "admin"):
        return jsonify({"error": "無權限刪除此貼文"}), 403

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE forum_posts SET is_deleted = 1 WHERE post_id = %s", (post_id,))
        conn.commit()
    return jsonify({"message": "貼文已刪除"})


# ── 留言 ──────────────────────────────────────────────────────────────────────

@forum_bp.route("/posts/<int:post_id>/comments", methods=["POST"])
@login_required
def create_comment(post_id: int):
    """
    POST /forum/posts/<post_id>/comments
    Body: { "content": "...", "parent_id": null, "is_anonymous": false }
    """
    uid  = session[SESSION_USER_KEY]
    data = request.get_json(silent=True) or {}

    content      = (data.get("content") or "").strip()[:MAX_COMMENT_LEN]
    parent_id    = data.get("parent_id")
    is_anonymous = bool(data.get("is_anonymous", False))

    if len(content) < 2:
        return jsonify({"error": "留言至少需要 2 個字"}), 400

    # 確認貼文存在
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT post_id FROM forum_posts WHERE post_id=%s AND is_deleted=0", (post_id,))
            if not cur.fetchone():
                return jsonify({"error": "貼文不存在"}), 404

    sql = """
        INSERT INTO forum_comments (post_id, web_user_id, parent_id, content, is_anonymous)
        VALUES (%s, %s, %s, %s, %s)
    """
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (post_id, uid, parent_id or None, content, int(is_anonymous)))
            comment_id = cur.lastrowid
            # 更新貼文留言數
            cur.execute("UPDATE forum_posts SET comment_count = comment_count + 1 WHERE post_id = %s",
                        (post_id,))
        conn.commit()

    return jsonify({"message": "留言成功", "comment_id": comment_id}), 201


# ── 按讚 ──────────────────────────────────────────────────────────────────────

@forum_bp.route("/posts/<int:post_id>/like", methods=["POST"])
@login_required
def toggle_post_like(post_id: int):
    """POST /forum/posts/<post_id>/like — 按讚 / 取消按讚（切換）"""
    uid = session[SESSION_USER_KEY]

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT like_id FROM post_likes WHERE post_id=%s AND web_user_id=%s",
                        (post_id, uid))
            existing = cur.fetchone()

            if existing:
                # 取消按讚
                cur.execute("DELETE FROM post_likes WHERE post_id=%s AND web_user_id=%s",
                            (post_id, uid))
                cur.execute("UPDATE forum_posts SET like_count = GREATEST(0, like_count-1) WHERE post_id=%s",
                            (post_id,))
                liked = False
            else:
                # 按讚
                cur.execute("INSERT IGNORE INTO post_likes (post_id, web_user_id) VALUES (%s, %s)",
                            (post_id, uid))
                cur.execute("UPDATE forum_posts SET like_count = like_count + 1 WHERE post_id=%s",
                            (post_id,))
                liked = True
        conn.commit()

    # 取得最新 like_count
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT like_count FROM forum_posts WHERE post_id=%s", (post_id,))
            row = cur.fetchone()

    return jsonify({"liked": liked, "like_count": row["like_count"] if row else 0})


@forum_bp.route("/comments/<int:comment_id>/like", methods=["POST"])
@login_required
def toggle_comment_like(comment_id: int):
    """POST /forum/comments/<comment_id>/like — 留言按讚切換"""
    uid = session[SESSION_USER_KEY]

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT like_id FROM comment_likes WHERE comment_id=%s AND web_user_id=%s",
                        (comment_id, uid))
            existing = cur.fetchone()

            if existing:
                cur.execute("DELETE FROM comment_likes WHERE comment_id=%s AND web_user_id=%s",
                            (comment_id, uid))
                cur.execute("UPDATE forum_comments SET like_count = GREATEST(0, like_count-1) WHERE comment_id=%s",
                            (comment_id,))
                liked = False
            else:
                cur.execute("INSERT IGNORE INTO comment_likes (comment_id, web_user_id) VALUES (%s,%s)",
                            (comment_id, uid))
                cur.execute("UPDATE forum_comments SET like_count = like_count+1 WHERE comment_id=%s",
                            (comment_id,))
                liked = True
        conn.commit()

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT like_count FROM forum_comments WHERE comment_id=%s", (comment_id,))
            row = cur.fetchone()

    return jsonify({"liked": liked, "like_count": row["like_count"] if row else 0})


# ── 熱門貼文 ─────────────────────────────────────────────────────────────────

@forum_bp.route("/hot", methods=["GET"])
def hot_posts():
    """GET /forum/hot — 熱門貼文（Top 10）"""
    sql = "SELECT * FROM v_hot_posts LIMIT 10"
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            posts = cur.fetchall()
    return jsonify(posts)
