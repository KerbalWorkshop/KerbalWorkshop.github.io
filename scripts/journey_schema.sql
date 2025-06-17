CREATE TABLE IF NOT EXISTS "entries" (
	"id"	TEXT NOT NULL UNIQUE,
	"title"	TEXT NOT NULL,
	"date_text"	TEXT,
	"body_text"	TEXT,
	"layout_type" TEXT NOT NULL DEFAULT 'standard_grid',
	"sort_order"	INTEGER,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "images" (
	"id"	TEXT NOT NULL UNIQUE,
	"entry_id"	TEXT NOT NULL,
	"file_path"	TEXT NOT NULL,
	"alt_text"	TEXT,
	"aspect_ratio"	TEXT,
	"sort_order"	INTEGER,
	PRIMARY KEY("id"),
	FOREIGN KEY("entry_id") REFERENCES "entries"("id") ON DELETE CASCADE
);