CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    label TEXT,
    file_path TEXT,
    date TEXT,
    integration INTEGER,
    camera TEXT,
    telescope TEXT,
    notes TEXT,
    width INTEGER,
    height INTEGER,
    featured INTEGER DEFAULT 0,
    preview_path TEXT,
    preview_width INTEGER,
    preview_height INTEGER
);

CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS galleries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS image_subjects (
    image_id TEXT,
    subject_id INTEGER,
    bounding_box TEXT,
    thumbnail_box TEXT,
    PRIMARY KEY(image_id, subject_id),
    FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS image_galleries (
    image_id TEXT,
    gallery_id INTEGER,
    PRIMARY KEY(image_id, gallery_id),
    FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE
);