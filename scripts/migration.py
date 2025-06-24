import sqlite3
from pathlib import Path
from PIL import Image, ImageFile
import sys
import os

# Ensure the script can find the project root
BASE_DIR = Path(__file__).resolve().parent.parent
ImageFile.LOAD_TRUNCATED_IMAGES = True

# Configuration (should match gallery_manager.py)
DB_PATH = BASE_DIR / "data" / "gallery.db"
ORIG_DIR = BASE_DIR / "photos" / "originals"
PREVIEW_DIR = BASE_DIR / "photos" / "previews"
THUMBS_DIR = BASE_DIR / "photos" / "thumbs" # Path to the old directory for cleanup check
PREVIEW_MAX_SIZE = (1200, 1200)

def get_table_columns(cursor, table_name):
    """Helper function to get a list of column names for a table."""
    cursor.execute(f"PRAGMA table_info({table_name})")
    return [row[1] for row in cursor.fetchall()]

def run_migration():
    """
    Performs the one-time migration of the database schema and generates
    the new preview image assets.
    """
    if not DB_PATH.exists():
        print(f"Error: Database not found at {DB_PATH}")
        return

    print("--- Starting Gallery Data Migration ---")
    
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # --- Step 1: Update Database Schema ---
        print("\n[Step 1/3] Updating database schema...")

        # Add new columns to 'images' table if they don't exist
        image_cols = get_table_columns(cursor, 'images')
        if 'preview_path' not in image_cols:
            print("  - Adding 'preview_path' to 'images' table...")
            cursor.execute("ALTER TABLE images ADD COLUMN preview_path TEXT")
        if 'preview_width' not in image_cols:
            print("  - Adding 'preview_width' to 'images' table...")
            cursor.execute("ALTER TABLE images ADD COLUMN preview_width INTEGER")
        if 'preview_height' not in image_cols:
            print("  - Adding 'preview_height' to 'images' table...")
            cursor.execute("ALTER TABLE images ADD COLUMN preview_height INTEGER")

        # Rebuild 'image_subjects' to add 'thumbnail_box' and remove 'thumb_path'
        subject_cols = get_table_columns(cursor, 'image_subjects')
        if 'thumbnail_box' not in subject_cols or 'thumb_path' in subject_cols:
            print("  - Rebuilding 'image_subjects' table for new schema...")
            
            # Create a new table with the desired final schema
            cursor.execute("""
                CREATE TABLE image_subjects_new (
                    image_id TEXT,
                    subject_id INTEGER,
                    bounding_box TEXT,
                    thumbnail_box TEXT,
                    PRIMARY KEY(image_id, subject_id),
                    FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE,
                    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
                )
            """)
            
            # Copy data from the old table to the new one
            cursor.execute("""
                INSERT INTO image_subjects_new (image_id, subject_id, bounding_box)
                SELECT image_id, subject_id, bounding_box FROM image_subjects
            """)
            
            # Drop the old table and rename the new one
            cursor.execute("DROP TABLE image_subjects")
            cursor.execute("ALTER TABLE image_subjects_new RENAME TO image_subjects")
            print("  - 'image_subjects' table rebuilt successfully.")

        conn.commit()
        print("Schema update complete.")

        # --- Step 2: Generate Preview Image Assets ---
        print("\n[Step 2/3] Generating preview images...")
        PREVIEW_DIR.mkdir(exist_ok=True)
        
        cursor.execute("SELECT id, file_path FROM images WHERE preview_path IS NULL OR preview_path = ''")
        images_to_process = cursor.fetchall()
        total = len(images_to_process)

        if total == 0:
            print("  - No images to process. All previews seem to exist.")
        else:
            print(f"  - Found {total} images needing a preview...")

        for index, (image_id, file_path_str) in enumerate(images_to_process):
            original_path = BASE_DIR / file_path_str
            if not original_path.exists():
                print(f"  ! WARNING: Original file not found for {image_id}: {original_path}. Skipping.")
                continue

            try:
                with Image.open(original_path) as img:
                    preview_img = img.copy()
                    preview_img.thumbnail(PREVIEW_MAX_SIZE, Image.Resampling.LANCZOS)
                    
                    preview_filename = f"{image_id}_preview.jpg"
                    preview_dest = PREVIEW_DIR / preview_filename
                    
                    if preview_img.mode in ("RGBA", "P"):
                        preview_img = preview_img.convert("RGB")
                    
                    preview_img.save(preview_dest, "JPEG", quality=85)
                    preview_dims = preview_img.size

                    # Update the database with the new preview info
                    update_sql = "UPDATE images SET preview_path=?, preview_width=?, preview_height=? WHERE id=?"
                    cursor.execute(update_sql, (str(preview_dest.relative_to(BASE_DIR).as_posix()), preview_dims[0], preview_dims[1], image_id))
                    
                    print(f"  ({index + 1}/{total}) Generated preview for {image_id}")

            except Exception as e:
                print(f"  ! ERROR processing {image_id}: {e}")
        
        conn.commit()
        print("Preview image generation complete.")

        # --- Step 3: Final Instructions ---
        print("\n[Step 3/3] Migration finished successfully!")
        print("-" * 40)
        print("IMPORTANT - MANUAL CLEANUP REQUIRED:")
        if THUMBS_DIR.exists() and any(THUMBS_DIR.iterdir()):
             print(f"  - The old '/photos/thumbs/' directory still exists.")
             print("  - After verifying that your website works correctly with the new system,")
             print("    you can MANUALLY DELETE this entire directory to save space.")
        else:
            print("  - Old '/photos/thumbs/' directory appears to be empty or gone. No cleanup needed.")
        print("-" * 40)


    except sqlite3.Error as e:
        print(f"\nAn SQL error occurred: {e}")
        if conn:
            conn.rollback()
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()
            print("\nDatabase connection closed.")

if __name__ == "__main__":
    run_migration()