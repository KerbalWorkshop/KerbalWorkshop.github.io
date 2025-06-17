import tkinter as tk
from tkinter import ttk, scrolledtext, simpledialog, messagebox, filedialog
import sqlite3
import json
import uuid
import shutil
from pathlib import Path

# --- CONFIGURATION ---
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "journey.db"
JSON_OUTPUT_PATH = DATA_DIR / "journey_data.json"
IMAGE_ASSETS_DIR = BASE_DIR / "journeyimages"

DATA_DIR.mkdir(exist_ok=True)
IMAGE_ASSETS_DIR.mkdir(exist_ok=True)

# --- DATABASE MANAGEMENT ---
class DatabaseManager:
    def __init__(self, db_path):
        self.db_path = db_path
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.init_db()

    def _execute(self, query, params=(), commit=False):
        cursor = self.conn.cursor()
        cursor.execute(query, params)
        if commit:
            self.conn.commit()
        return cursor

    def _import_from_json(self):
        """Reads the JSON file and populates the database. ONE-TIME operation."""
        if not JSON_OUTPUT_PATH.exists():
            return # No data to import

        print(f"Found {JSON_OUTPUT_PATH.name}, attempting to import data...")
        try:
            with open(JSON_OUTPUT_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            with self.conn: # Use a transaction for the whole import
                for entry_data in data:
                    self.conn.execute(
                        "INSERT INTO entries (id, title, date_text, body_text, layout_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
                        (
                            entry_data['id'], entry_data['title'], entry_data['date_text'], 
                            entry_data['body_text'], entry_data['layout_type'], entry_data['sort_order']
                        )
                    )
                    for image_data in entry_data.get('images', []):
                        self.conn.execute(
                            "INSERT INTO images (id, entry_id, file_path, alt_text, aspect_ratio, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
                            (
                                image_data['id'], image_data['entry_id'], image_data['file_path'], 
                                image_data['alt_text'], image_data['aspect_ratio'], image_data['sort_order']
                            )
                        )
            print(f"Successfully imported {len(data)} entries from JSON.")
            messagebox.showinfo("Import Complete", f"Successfully imported {len(data)} entries from {JSON_OUTPUT_PATH.name} into the new database.")
        except Exception as e:
            print(f"Error importing data from JSON: {e}")
            messagebox.showerror("Import Error", f"Could not import data from journey_data.json.\n\n{e}")

    def init_db(self):
        cursor = self._execute("SELECT name FROM sqlite_master WHERE type='table' AND name='entries'")
        table_exists = cursor.fetchone()

        if not table_exists:
            # --- Tables do not exist, create schema from scratch ---
            schema_path = BASE_DIR / "scripts" / "journey_schema.sql"
            if not schema_path.exists():
                messagebox.showerror("Fatal Error", f"journey_schema.sql not found in {schema_path.parent}")
                raise FileNotFoundError("journey_schema.sql not found.")
            
            print("Creating new journey database from schema...")
            with open(schema_path, 'r') as f:
                self.conn.executescript(f.read())
            self.conn.commit()
            print("Journey database created.")
            
            # After creating, immediately try to import
            self._import_from_json()
        else:
            # --- FIX: Tables exist, check if they are empty from a failed import ---
            cursor = self._execute("SELECT id FROM entries LIMIT 1")
            if not cursor.fetchone():
                # The database exists but is empty. This indicates a prior failed import.
                print("Database is empty. Attempting data import from JSON...")
                self._import_from_json()

    def get_all_entries(self):
        return self._execute("SELECT * FROM entries ORDER BY sort_order ASC").fetchall()

    def get_images_for_entry(self, entry_id):
        return self._execute("SELECT * FROM images WHERE entry_id = ? ORDER BY sort_order ASC", (entry_id,)).fetchall()

    def add_entry(self, title, date_text, body_text, layout_type):
        max_order = self._execute("SELECT MAX(sort_order) FROM entries").fetchone()[0] or 0
        new_id = str(uuid.uuid4())
        self._execute(
            "INSERT INTO entries (id, title, date_text, body_text, layout_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
            (new_id, title, date_text, body_text, layout_type, max_order + 1),
            commit=True
        )
        return new_id

    def update_entry(self, entry_id, title, date_text, body_text, layout_type):
        self._execute(
            "UPDATE entries SET title=?, date_text=?, body_text=?, layout_type=? WHERE id=?",
            (title, date_text, body_text, layout_type, entry_id),
            commit=True
        )

    def delete_entry(self, entry_id):
        with self.conn:
            self._execute("DELETE FROM images WHERE entry_id = ?", (entry_id,))
            self._execute("DELETE FROM entries WHERE id = ?", (entry_id,))

    def add_image(self, entry_id, file_path, alt_text, aspect_ratio):
        max_order = self._execute("SELECT MAX(sort_order) FROM images WHERE entry_id = ?", (entry_id,)).fetchone()[0] or 0
        new_id = str(uuid.uuid4())
        self._execute(
            "INSERT INTO images (id, entry_id, file_path, alt_text, aspect_ratio, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
            (new_id, entry_id, file_path, alt_text, aspect_ratio, max_order + 1),
            commit=True
        )

    def update_image(self, image_id, file_path, alt_text, aspect_ratio):
        self._execute(
            "UPDATE images SET file_path=?, alt_text=?, aspect_ratio=? WHERE id=?",
            (file_path, alt_text, aspect_ratio, image_id),
            commit=True
        )

    def delete_image(self, image_id):
        self._execute("DELETE FROM images WHERE id = ?", (image_id,), commit=True)
        
    def update_entry_order(self, ordered_ids):
        with self.conn:
            for index, entry_id in enumerate(ordered_ids):
                self._execute("UPDATE entries SET sort_order = ? WHERE id = ?", (index + 1, entry_id))
            
    def update_image_order(self, ordered_ids):
        with self.conn:
            for index, image_id in enumerate(ordered_ids):
                self._execute("UPDATE images SET sort_order = ? WHERE id = ?", (index + 1, image_id))

    def get_all_data_for_publishing(self):
        entries = self.get_all_entries()
        result = []
        for entry in entries:
            entry_dict = dict(entry)
            images = self.get_images_for_entry(entry['id'])
            entry_dict['images'] = [dict(image) for image in images]
            result.append(entry_dict)
        return result

# --- DIALOGS (Unchanged) ---
class ImageDialog(simpledialog.Dialog):
    def __init__(self, parent, title, image_data=None):
        self.image_data = image_data or {}
        self.new_path = self.image_data.get('file_path')
        super().__init__(parent, title)

    def body(self, master):
        ttk.Label(master, text="Alt Text:").grid(row=0, sticky="w")
        self.alt_text_var = tk.StringVar(master, value=self.image_data.get('alt_text', ''))
        self.alt_text_entry = ttk.Entry(master, textvariable=self.alt_text_var, width=50)
        self.alt_text_entry.grid(row=1, sticky="ew")
        ttk.Label(master, text="Aspect Ratio (e.g., 4 / 3):").grid(row=2, sticky="w", pady=(10,0))
        self.aspect_var = tk.StringVar(master, value=self.image_data.get('aspect_ratio', ''))
        self.aspect_entry = ttk.Entry(master, textvariable=self.aspect_var, width=50)
        self.aspect_entry.grid(row=3, sticky="ew")
        path_frame = ttk.Frame(master)
        path_frame.grid(row=4, columnspan=2, pady=(10,0), sticky="ew")
        self.path_label_var = tk.StringVar(master, value=self.new_path or "No file selected")
        ttk.Label(path_frame, text="File Path:").pack(side="left")
        ttk.Label(path_frame, textvariable=self.path_label_var, foreground="blue", wraplength=350).pack(side="left", padx=5)
        btn_frame = ttk.Frame(master)
        btn_frame.grid(row=5, columnspan=2, pady=10)
        ttk.Button(btn_frame, text="Choose Existing Image...", command=self.choose_existing).pack(side="left", padx=5)
        ttk.Button(btn_frame, text="Upload New Image...", command=self.upload_new).pack(side="left", padx=5)
        return self.alt_text_entry 

    def choose_existing(self):
        filepath = filedialog.askopenfilename(title="Select Image File", initialdir=IMAGE_ASSETS_DIR, filetypes=[("Image Files", "*.jpg *.jpeg *.png *.gif")])
        if filepath:
            self.new_path = Path(filepath).relative_to(BASE_DIR).as_posix()
            self.path_label_var.set(self.new_path)

    def upload_new(self):
        source_path_str = filedialog.askopenfilename(title="Select Image to Upload", filetypes=[("Image Files", "*.jpg *.jpeg *.png *.gif")])
        if not source_path_str: return
        source_path = Path(source_path_str)
        unique_id = str(uuid.uuid4())[:8]
        new_filename = f"{source_path.stem}_{unique_id}{source_path.suffix}"
        dest_path = IMAGE_ASSETS_DIR / new_filename
        try:
            shutil.copy(source_path, dest_path)
            self.new_path = dest_path.relative_to(BASE_DIR).as_posix()
            self.path_label_var.set(self.new_path)
            messagebox.showinfo("Success", f"Uploaded and saved as\n{new_filename}", parent=self)
        except Exception as e:
            messagebox.showerror("Error", f"Failed to upload image: {e}", parent=self)

    def apply(self):
        self.result = {"file_path": self.new_path, "alt_text": self.alt_text_var.get(), "aspect_ratio": self.aspect_var.get()}

# --- MAIN GUI APPLICATION (Unchanged) ---
class App(tk.Tk):
    def __init__(self):
        super().__init__(); self.title("Journey Manager"); self.geometry("1200x800")
        self.db = DatabaseManager(DB_PATH); self.build_ui(); self.refresh_entries_list()
    def build_ui(self):
        main_pane = ttk.PanedWindow(self, orient=tk.HORIZONTAL); main_pane.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        left_frame = ttk.Frame(main_pane, width=350); main_pane.add(left_frame, weight=1)
        ttk.Label(left_frame, text="Journey Entries", font=("", 12, "bold")).pack(pady=5)
        self.entries_tree = ttk.Treeview(left_frame, columns=("Title"), show="headings"); self.entries_tree.heading("Title", text="Title")
        self.entries_tree.pack(fill=tk.BOTH, expand=True); self.entries_tree.bind("<<TreeviewSelect>>", self.on_entry_select)
        entry_btn_frame = ttk.Frame(left_frame); entry_btn_frame.pack(fill=tk.X, pady=5)
        ttk.Button(entry_btn_frame, text="Add", command=self.add_entry).pack(side=tk.LEFT, padx=2)
        ttk.Button(entry_btn_frame, text="Delete", command=self.delete_entry).pack(side=tk.LEFT, padx=2)
        ttk.Button(entry_btn_frame, text="▲ Up", command=lambda: self.move_item(self.entries_tree, 'up')).pack(side=tk.RIGHT, padx=2)
        ttk.Button(entry_btn_frame, text="▼ Down", command=lambda: self.move_item(self.entries_tree, 'down')).pack(side=tk.RIGHT, padx=2)
        self.right_frame = ttk.Frame(main_pane); main_pane.add(self.right_frame, weight=3); self.build_details_view()
        ttk.Button(self, text="Publish to Website", command=self.publish_data).pack(pady=10)
    def build_details_view(self):
        self.details_notebook = ttk.Notebook(self.right_frame); self.details_notebook.pack(fill=tk.BOTH, expand=True)
        text_tab = ttk.Frame(self.details_notebook); self.details_notebook.add(text_tab, text="Entry Details")
        ttk.Label(text_tab, text="Title:").grid(row=0, column=0, padx=5, pady=5, sticky="w")
        self.title_var = tk.StringVar(); ttk.Entry(text_tab, textvariable=self.title_var).grid(row=0, column=1, padx=5, pady=5, sticky="ew")
        ttk.Label(text_tab, text="Date Text:").grid(row=1, column=0, padx=5, pady=5, sticky="w")
        self.date_text_var = tk.StringVar(); ttk.Entry(text_tab, textvariable=self.date_text_var).grid(row=1, column=1, padx=5, pady=5, sticky="ew")
        ttk.Label(text_tab, text="Layout Type:").grid(row=2, column=0, padx=5, pady=5, sticky="w")
        self.layout_var = tk.StringVar()
        ttk.Combobox(text_tab, textvariable=self.layout_var, values=["standard_grid", "youtube_layout", "shorts_layout", "spring_layout"], state="readonly").grid(row=2, column=1, padx=5, pady=5, sticky="ew")
        ttk.Label(text_tab, text="Body Text:").grid(row=3, column=0, padx=5, pady=5, sticky="nw")
        self.body_text = scrolledtext.ScrolledText(text_tab, height=10, wrap=tk.WORD); self.body_text.grid(row=3, column=1, padx=5, pady=5, sticky="nsew")
        text_tab.columnconfigure(1, weight=1); text_tab.rowconfigure(3, weight=1)
        ttk.Button(text_tab, text="Save Text Changes", command=self.save_entry_text).grid(row=4, column=1, pady=10, sticky="e")
        self.images_tab = ttk.Frame(self.details_notebook); self.details_notebook.add(self.images_tab, text="Images", state="disabled"); self.build_images_view()
    def build_images_view(self):
        self.images_tree = ttk.Treeview(self.images_tab, columns=("File", "Alt Text", "Aspect Ratio"), show="headings")
        self.images_tree.heading("File", text="File Path"); self.images_tree.heading("Alt Text", text="Alt Text"); self.images_tree.heading("Aspect Ratio", text="Aspect Ratio")
        self.images_tree.column("File", width=250); self.images_tree.column("Alt Text", width=200); self.images_tree.column("Aspect Ratio", width=100)
        self.images_tree.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        img_btn_frame = ttk.Frame(self.images_tab); img_btn_frame.pack(fill=tk.X, pady=5, padx=5)
        ttk.Button(img_btn_frame, text="Add", command=self.add_image).pack(side=tk.LEFT)
        ttk.Button(img_btn_frame, text="Edit", command=self.edit_image).pack(side=tk.LEFT, padx=5)
        ttk.Button(img_btn_frame, text="Delete", command=self.delete_image).pack(side=tk.LEFT)
        ttk.Button(img_btn_frame, text="▲ Up", command=lambda: self.move_item(self.images_tree, 'up')).pack(side=tk.RIGHT)
        ttk.Button(img_btn_frame, text="▼ Down", command=lambda: self.move_item(self.images_tree, 'down')).pack(side=tk.RIGHT, padx=5)
    def refresh_entries_list(self):
        self.entries_tree.delete(*self.entries_tree.get_children())
        for entry in self.db.get_all_entries(): self.entries_tree.insert("", tk.END, iid=entry['id'], values=(entry['title'],))
        self.clear_details()
    def on_entry_select(self, event=None):
        entry_id = self.get_selected_entry_id()
        if not entry_id: self.clear_details(); return
        entry = self.db._execute("SELECT * FROM entries WHERE id=?", (entry_id,)).fetchone()
        if entry:
            self.title_var.set(entry['title']); self.date_text_var.set(entry['date_text']); self.layout_var.set(entry['layout_type'])
            self.body_text.delete("1.0", tk.END); self.body_text.insert("1.0", entry['body_text'])
            self.details_notebook.tab(self.images_tab, state="normal"); self.refresh_images_list(entry_id)
        else: self.clear_details()
    def refresh_images_list(self, entry_id):
        self.images_tree.delete(*self.images_tree.get_children())
        for image in self.db.get_images_for_entry(entry_id): self.images_tree.insert("", tk.END, iid=image['id'], values=(image['file_path'], image['alt_text'], image['aspect_ratio']))
    def get_selected_id(self, tree): return tree.selection()[0] if tree.selection() else None
    def get_selected_entry_id(self): return self.get_selected_id(self.entries_tree)
    def get_selected_image_id(self): return self.get_selected_id(self.images_tree)
    def clear_details(self):
        self.title_var.set(""); self.date_text_var.set(""); self.layout_var.set(""); self.body_text.delete("1.0", tk.END)
        self.images_tree.delete(*self.images_tree.get_children()); self.details_notebook.tab(self.images_tab, state="disabled")
    def add_entry(self):
        title = simpledialog.askstring("Add Entry", "Enter new entry title:", parent=self)
        if title: self.db.add_entry(title, title, "New entry body text.", "standard_grid"); self.refresh_entries_list()
    def delete_entry(self):
        entry_id = self.get_selected_entry_id()
        if entry_id and messagebox.askyesno("Confirm Delete", "Delete this entire entry and all its images?"):
            self.db.delete_entry(entry_id); self.refresh_entries_list()
    def save_entry_text(self):
        entry_id = self.get_selected_entry_id();
        if not entry_id: return
        self.db.update_entry(entry_id, self.title_var.get(), self.date_text_var.get(), self.body_text.get("1.0", "end-1c"), self.layout_var.get())
        messagebox.showinfo("Success", "Entry text updated."); self.entries_tree.item(entry_id, values=(self.title_var.get(),))
    def add_image(self):
        entry_id = self.get_selected_entry_id()
        if not entry_id: return
        dialog = ImageDialog(self, "Add New Image")
        if dialog.result and dialog.result.get('file_path'):
            self.db.add_image(entry_id, dialog.result['file_path'], dialog.result['alt_text'], dialog.result['aspect_ratio'])
            self.refresh_images_list(entry_id)
    def edit_image(self):
        entry_id, image_id = self.get_selected_entry_id(), self.get_selected_image_id()
        if not (entry_id and image_id): return
        current_data = dict(self.db._execute("SELECT * FROM images WHERE id=?",(image_id,)).fetchone())
        dialog = ImageDialog(self, "Edit Image", image_data=current_data)
        if dialog.result and dialog.result.get('file_path'):
            self.db.update_image(image_id, dialog.result['file_path'], dialog.result['alt_text'], dialog.result['aspect_ratio'])
            self.refresh_images_list(entry_id)
    def delete_image(self):
        entry_id, image_id = self.get_selected_entry_id(), self.get_selected_image_id()
        if (entry_id and image_id) and messagebox.askyesno("Confirm Delete", "Delete this image?"):
            self.db.delete_image(image_id); self.refresh_images_list(entry_id)
    def move_item(self, tree, direction):
        item_id = self.get_selected_id(tree)
        if not item_id: return
        index = tree.index(item_id)
        if direction == 'up' and index > 0: tree.move(item_id, '', index - 1)
        elif direction == 'down' and index < len(tree.get_children()) - 1: tree.move(item_id, '', index + 1)
        ordered_ids = tree.get_children()
        if tree == self.entries_tree: self.db.update_entry_order(ordered_ids)
        elif tree == self.images_tree: self.db.update_image_order(ordered_ids)
    def publish_data(self):
        if not messagebox.askyesno("Confirm Publish", f"This will overwrite {JSON_OUTPUT_PATH.name}. Continue?"): return
        all_data = self.db.get_all_data_for_publishing()
        try:
            with open(JSON_OUTPUT_PATH, "w", encoding='utf-8') as f:
                json.dump(all_data, f, indent=2, ensure_ascii=False)
            messagebox.showinfo("Success", f"Successfully published to {JSON_OUTPUT_PATH.name}")
        except Exception as e: messagebox.showerror("Error", f"Failed to write JSON file: {e}")

if __name__ == "__main__":
    app = App()
    app.mainloop()