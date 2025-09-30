#!/usr/bin/env python3
from pathlib import Path
import json
from xml.sax.saxutils import escape

# --- constants you can tweak if needed ---
SITE = "https://hansenspace.io"         # your site root
GALLERY_PAGE_PATH = "/photos/"          # the page that shows the images
JSON_REL = "photos/data/all_images.json"
ORIG_REL = "photos/originals"
OUT_REL  = "development/image-sitemap.xml"
# ----------------------------------------

def main():
    # [root] = parent of this script's folder (since script lives in /development)
    dev_dir = Path(__file__).resolve().parent
    root = dev_dir.parent

    json_path = root / JSON_REL
    originals_dir = root / ORIG_REL
    out_path = root / OUT_REL

    if not json_path.is_file():
        raise SystemExit(f"JSON not found: {json_path}")
    if not originals_dir.is_dir():
        raise SystemExit(f"Originals dir not found: {originals_dir}")

    data = json.loads(json_path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise SystemExit("JSON should be a list of image objects.")

    # collect images that actually exist in originals
    items = []
    for item in data:
        img_rel = (item.get("image_file") or "").strip()
        if not img_rel:
            continue
        img_name = Path(img_rel).name
        if (originals_dir / img_name).exists():
            items.append((img_rel, build_alt(item)))

    if not items:
        raise SystemExit("No images found in originals matching the JSON.")

    # build minimal image sitemap: one <url> (/photos/) with many <image:image>
    lines = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
                 'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">')
    lines.append("  <url>")
    lines.append(f"    <loc>{escape(SITE.rstrip('/') + GALLERY_PAGE_PATH)}</loc>")

    for img_rel, alt in items:
        img_url = SITE.rstrip('/') + '/' + img_rel.lstrip('/')
        title = Path(img_rel).stem
        lines.append("    <image:image>")
        lines.append(f"      <image:loc>{escape(img_url)}</image:loc>")
        # keep both title + caption (alt-like) nice and simple
        lines.append(f"      <image:title>{escape(title)}</image:title>")
        lines.append(f"      <image:caption>{escape(alt)}</image:caption>")
        lines.append("    </image:image>")

    lines.append("  </url>")
    lines.append("</urlset>")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {out_path} with {len(items)} images")

def build_alt(item: dict) -> str:
    """
    Construct alt text:
    - use subjects’ names if present (first 3), else fall back to label or filename stem
    - append your credit
    Example: "NGC 6888 - Crescent Nebula, Cygnus Wall — astrophotography by Dane Hansen (Hansen Space)."
    """
    # subjects
    subs = item.get("subjects") or []
    names = [s.get("name") for s in subs if isinstance(s, dict) and s.get("name")]
    subject_text = ", ".join(names[:3]).strip(", ")

    if not subject_text:
        label = (item.get("label") or "").strip()
        if label:
            subject_text = label
        else:
            # last-ditch: filename stem
            stem = Path((item.get("image_file") or "image").strip()).stem
            subject_text = stem

    return f"{subject_text} — astrophotography by Dane Hansen (Hansen Space)."

if __name__ == "__main__":
    main()
