-- forum_schema.sql — 網頁版登入 + 論壇資料表
-- 接續 parenting_navigator_schema.sql 執行
-- DB: parenting_nav  User: pnav  Password: PNav@2025

USE parenting_nav;

-- ── 網頁使用者（與 LINE users 分開管理） ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS web_users (
    web_user_id  INT          NOT NULL AUTO_INCREMENT,
    username     VARCHAR(30)  NOT NULL UNIQUE COMMENT '顯示名稱',
    email        VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(128) NOT NULL COMMENT 'bcrypt hash',
    avatar_url   VARCHAR(255),
    bio          VARCHAR(200),
    city         VARCHAR(20)  COMMENT '所在縣市',
    role         ENUM('member','moderator','admin') NOT NULL DEFAULT 'member',
    is_active    TINYINT(1)   NOT NULL DEFAULT 1,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login   DATETIME,
    PRIMARY KEY (web_user_id),
    INDEX idx_email    (email),
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 論壇分類板塊 ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forum_categories (
    category_id   INT         NOT NULL AUTO_INCREMENT,
    name          VARCHAR(30) NOT NULL UNIQUE,
    slug          VARCHAR(30) NOT NULL UNIQUE COMMENT 'URL-friendly 名稱',
    description   VARCHAR(200),
    icon          VARCHAR(10) COMMENT 'emoji icon',
    color         VARCHAR(7)  COMMENT 'hex 色碼（卡片顯示用）',
    sort_order    TINYINT     NOT NULL DEFAULT 0,
    is_active     TINYINT(1)  NOT NULL DEFAULT 1,
    PRIMARY KEY (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 預設 5 個板塊
INSERT IGNORE INTO forum_categories (name, slug, description, icon, color, sort_order) VALUES
('補助討論',   'subsidy',  '育兒津貼、生育獎勵金、托育補助等申辦心得分享',   '💰', '#DFB199', 1),
('寶寶健康',   'health',   '疫苗接種、兒童健檢、發展里程碑討論',              '🍼', '#99B6B4', 2),
('托育分享',   'daycare',  '公托、私托、保母選擇心得與評價',                   '🏠', '#BACFCE', 3),
('新手問答',   'newbie',   '什麼問題都可以問，沒有笨問題！',                   '❓', '#D48982', 4),
('生活日常',   'life',     '育兒日記、親子活動、爸媽身心健康',                 '🌿', '#9EB995', 5);

-- ── 論壇貼文 ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forum_posts (
    post_id      BIGINT       NOT NULL AUTO_INCREMENT,
    category_id  INT          NOT NULL,
    web_user_id  INT          NOT NULL,
    title        VARCHAR(100) NOT NULL,
    content      TEXT         NOT NULL,
    image_url    VARCHAR(255) COMMENT '附圖（可選）',
    like_count   INT          NOT NULL DEFAULT 0,
    comment_count INT         NOT NULL DEFAULT 0,
    view_count   INT          NOT NULL DEFAULT 0,
    is_pinned    TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '置頂',
    is_anonymous TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '匿名發文',
    is_deleted   TINYINT(1)   NOT NULL DEFAULT 0,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id),
    FOREIGN KEY (category_id)  REFERENCES forum_categories(category_id),
    FOREIGN KEY (web_user_id)  REFERENCES web_users(web_user_id),
    INDEX idx_category_created (category_id, created_at DESC),
    INDEX idx_hot              (like_count DESC, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 論壇留言 ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forum_comments (
    comment_id   BIGINT       NOT NULL AUTO_INCREMENT,
    post_id      BIGINT       NOT NULL,
    web_user_id  INT          NOT NULL,
    parent_id    BIGINT       COMMENT '回覆某則留言（巢狀留言）',
    content      TEXT         NOT NULL,
    like_count   INT          NOT NULL DEFAULT 0,
    is_anonymous TINYINT(1)   NOT NULL DEFAULT 0,
    is_deleted   TINYINT(1)   NOT NULL DEFAULT 0,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (comment_id),
    FOREIGN KEY (post_id)     REFERENCES forum_posts(post_id) ON DELETE CASCADE,
    FOREIGN KEY (web_user_id) REFERENCES web_users(web_user_id),
    INDEX idx_post_created (post_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 按讚記錄（防重複） ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_likes (
    like_id     BIGINT   NOT NULL AUTO_INCREMENT,
    post_id     BIGINT   NOT NULL,
    web_user_id INT      NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (like_id),
    UNIQUE KEY uk_post_user (post_id, web_user_id),
    FOREIGN KEY (post_id)     REFERENCES forum_posts(post_id)   ON DELETE CASCADE,
    FOREIGN KEY (web_user_id) REFERENCES web_users(web_user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comment_likes (
    like_id     BIGINT   NOT NULL AUTO_INCREMENT,
    comment_id  BIGINT   NOT NULL,
    web_user_id INT      NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (like_id),
    UNIQUE KEY uk_comment_user (comment_id, web_user_id),
    FOREIGN KEY (comment_id)  REFERENCES forum_comments(comment_id) ON DELETE CASCADE,
    FOREIGN KEY (web_user_id) REFERENCES web_users(web_user_id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 熱門貼文 View ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_hot_posts AS
SELECT
    p.post_id,
    p.title,
    p.like_count,
    p.comment_count,
    p.view_count,
    p.created_at,
    c.name  AS category_name,
    c.icon  AS category_icon,
    c.color AS category_color,
    CASE WHEN p.is_anonymous = 1 THEN '匿名用戶' ELSE u.username END AS author_name
FROM forum_posts p
JOIN forum_categories c ON p.category_id = c.category_id
JOIN web_users        u ON p.web_user_id  = u.web_user_id
WHERE p.is_deleted = 0
ORDER BY (p.like_count * 3 + p.comment_count * 2 + p.view_count) DESC
LIMIT 50;
