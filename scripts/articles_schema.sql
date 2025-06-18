CREATE TABLE IF NOT EXISTS "articles" (
    "id"    TEXT NOT NULL UNIQUE,
    "title"    TEXT NOT NULL,
    "subtitle" TEXT,
    "publish_date"    TEXT NOT NULL,
    "hero_image_path"    TEXT,
    "source_md_path" TEXT NOT NULL,
    "is_spotlight"    INTEGER DEFAULT 0,
    "article_order" INTEGER UNIQUE,
    PRIMARY KEY("id")
);

CREATE TABLE IF NOT EXISTS "article_images" (
    "id"    TEXT NOT NULL UNIQUE,
    "article_id"    TEXT NOT NULL,
    "placeholder_name"    TEXT NOT NULL UNIQUE,
    "final_path"    TEXT NOT NULL,
    "width_percent"    INTEGER,
    PRIMARY KEY("id"),
    FOREIGN KEY("article_id") REFERENCES "articles"("id") ON DELETE CASCADE
);