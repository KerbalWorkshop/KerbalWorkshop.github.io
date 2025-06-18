import tkinter as tk
from tkinter import ttk, simpledialog, messagebox, filedialog
import sqlite3
import json
import uuid
import shutil
from pathlib import Path
import markdown2
import datetime
import re
from tkinterdnd2 import DND_FILES, TkinterDnD
from bs4 import BeautifulSoup

# --- Drag & Drop Helper Class ---
class DropTarget:
    def __init__(self, widget, callback):
        self.widget = widget
        self.callback = callback
        self.widget.drop_target_register(DND_FILES)
        self.widget.dnd_bind('<<Drop>>', self.on_drop)
    def on_drop(self, event):
        path_string = self.widget.tk.splitlist(event.data)[0]
        if path_string:
            self.callback(Path(path_string))

# --- CONFIGURATION ---
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
ARTICLES_DIR = BASE_DIR / "articles"
IMAGES_DIR = ARTICLES_DIR / "images"
DB_PATH = DATA_DIR / "articles.db"
JSON_OUTPUT_PATH = DATA_DIR / "articles.json"
TEMPLATE_PATH = Path(__file__).resolve().parent / "article_template.html"
INTERNAL_SOURCES_DIR = ARTICLES_DIR

DATA_DIR.mkdir(exist_ok=True)
ARTICLES_DIR.mkdir(exist_ok=True)
IMAGES_DIR.mkdir(exist_ok=True)


# --- DATABASE MANAGEMENT ---
class DatabaseManager:
    def __init__(self, db_path):
        self.db_path = db_path; self.conn = sqlite3.connect(self.db_path); self.conn.row_factory = sqlite3.Row; self.init_db()
    def _execute(self, q, p=(), c=False):
        cur = self.conn.cursor(); cur.execute(q, p)
        if c: self.conn.commit()
        return cur
    def init_db(self):
        if self._execute("SELECT name FROM sqlite_master WHERE type='table' AND name='articles'").fetchone(): return
        with open(Path(__file__).resolve().parent / "articles_schema.sql", 'r') as f: self.conn.executescript(f.read())
        self.conn.commit()
    def get_all_articles(self): return self._execute("SELECT * FROM articles ORDER BY publish_date DESC").fetchall()
    def add_article(self, data, image_mappings):
        with self.conn:
            a_id=str(uuid.uuid4()); a_order=(self._execute("SELECT MAX(article_order) FROM articles").fetchone()[0] or 0)+1
            self._execute("INSERT INTO articles (id, title, subtitle, publish_date, hero_image_path, source_md_path, is_spotlight, article_order) VALUES (?,?,?,?,?,?,?,?)", (a_id, data['title'], data['subtitle'], data['publish_date'], data['hero_image_path'], data['source_md_path'], data['is_spotlight'], a_order))
            for p, d in image_mappings.items(): self._execute("INSERT INTO article_images (id, article_id, placeholder_name, final_path, width_percent) VALUES (?,?,?,?,?)", (str(uuid.uuid4()), a_id, p, d['path'], d.get('width')))
        return a_id
    def update_article(self, a_id, data, image_mappings):
        with self.conn:
            self._execute("UPDATE articles SET title=?, subtitle=?, publish_date=?, hero_image_path=?, source_md_path=?, is_spotlight=? WHERE id=?", (data['title'], data['subtitle'], data['publish_date'], data['hero_image_path'], data['source_md_path'], data['is_spotlight'], a_id))
            self._execute("DELETE FROM article_images WHERE article_id = ?", (a_id,))
            for p, d in image_mappings.items(): self._execute("INSERT INTO article_images (id, article_id, placeholder_name, final_path, width_percent) VALUES (?,?,?,?,?)", (str(uuid.uuid4()), a_id, p, d['path'], d.get('width')))
    def delete_article(self, a_id):
        a_data, _ = self.get_article_data(a_id)
        if a_data:
            folder = ARTICLES_DIR / a_data['publish_date']
            if folder.exists(): shutil.rmtree(folder)
        with self.conn: self._execute("DELETE FROM article_images WHERE article_id=?", (a_id,)); self._execute("DELETE FROM articles WHERE id=?", (a_id,))
    def get_article_data(self, a_id):
        article = self._execute("SELECT * FROM articles WHERE id=?", (a_id,)).fetchone()
        if not article: return None, {}
        images = self._execute("SELECT * FROM article_images WHERE article_id=?", (a_id,)).fetchall()
        mappings = {img['placeholder_name']: {'path':img['final_path'], 'width':img['width_percent']} for img in images}
        return dict(article), mappings

# --- HTML GENERATION ---
class HTMLGenerator:
    def __init__(self, db, a_id):
        self.db = db
        self.article_id = a_id

    def generate(self):
        article_data, image_mappings = self.db.get_article_data(self.article_id)
        if not article_data or not article_data.get('source_md_path'):
            messagebox.showerror("Error", f"Article '{article_data.get('title')}' is missing its source Markdown file link in the database.")
            return False
        
        output_dir = ARTICLES_DIR / article_data['publish_date']
        internal_md_path = BASE_DIR / article_data['source_md_path']

        try:
            with open(internal_md_path, 'r', encoding='utf-8') as f:
                md_content = f.read()

            # Convert markdown to initial HTML, allowing raw HTML to pass through
            html_body = markdown2.markdown(md_content, extras={"fenced-code-blocks", "tables", "header-ids", "strike", "safe_mode"})

            # Use BeautifulSoup to reliably parse and modify the generated HTML
            soup = BeautifulSoup(html_body, 'lxml')
            
            # --- START MODIFICATION ---
            # Recursively find all text nodes in the parsed HTML.
            # We iterate through text nodes to ensure we don't incorrectly
            # replace hyphens inside HTML tags and attributes.
            for text_node in soup.find_all(string=True):
                # Skip replacement in elements where hyphens are often meaningful, like code blocks.
                if text_node.parent.name in ['pre', 'code', 'script', 'style']:
                    continue
                
                # Replace hyphens with typographic dashes.
                # The order is important: '---' must be replaced before '--'.
                modified_text = text_node.string.replace('---', '—').replace('--', '–')
                
                # Update the node in the tree only if a change was made.
                if modified_text != text_node.string:
                    text_node.string.replace_with(modified_text)
            # --- END MODIFICATION ---

            for img_tag in soup.find_all('img'):
                original_src = img_tag.get('src')
                if not original_src:
                    continue

                # Find the mapping for this image using its original path as the key
                details = image_mappings.get(original_src)
                
                if details:
                    # If a mapping exists, use the final path and width from the database
                    final_path = details.get('path')
                    width = details.get('width')
                else:
                    # If no mapping exists (e.g., a web link), use the original src and a default width
                    final_path = original_src
                    width = 80

                # Ensure the final path is root-relative if it's not a web URL
                if not final_path.startswith('http'):
                    img_tag['src'] = f"/{final_path.lstrip('/')}"
                else:
                    img_tag['src'] = final_path
                
                # Set the style attribute correctly
                if width is not None:
                    img_tag['style'] = f"width: {width}%;"
                elif 'style' in img_tag.attrs:
                    del img_tag['style'] # Remove style if no width is specified

                # Ensure the image is wrapped in a <figure> for consistent styling
                if img_tag.parent.name == 'p':
                    figure = soup.new_tag('figure')
                    figcaption = soup.new_tag('figcaption')
                    figcaption.string = img_tag.get('alt', '')
                    
                    # Move the img tag into the new figure
                    img_tag.parent.replace_with(figure)
                    figure.append(img_tag)
                    figure.append(figcaption)
            
            # Finalize the HTML
            with open(TEMPLATE_PATH, 'r', encoding='utf-8') as f:
                template_content = f.read()
            
            html = template_content.replace("{{ARTICLE_TITLE}}", article_data['title'])
            html = html.replace("{{ARTICLE_SUBTITLE}}", article_data['subtitle'] or '')
            html = html.replace("{{PUBLISH_DATE}}", datetime.datetime.strptime(article_data['publish_date'], "%Y-%m-%d").strftime("%B %d, %Y"))
            html = html.replace("{{ARTICLE_BODY}}", str(soup))
            
            output_dir.mkdir(exist_ok=True)
            with open(output_dir / "index.html", 'w', encoding='utf-8') as f:
                f.write(html)
            
            return True
        except FileNotFoundError:
            messagebox.showerror("HTML Generation Error", f"Could not find source file:\n{internal_md_path}\n\nPlease edit the article to re-link the source .md file.")
            return False
        except Exception as e:
            messagebox.showerror("HTML Generation Error", f"An error occurred: {e}")
            return False



class ArticleDialog(simpledialog.Dialog):
    def __init__(self, parent, db, title="Article", article_id=None):
        self.db = db
        self.article_id = article_id
        if self.article_id:
            self.data, self.image_mappings = self.db.get_article_data(self.article_id)
            self.data = dict(self.data) if self.data else {}
        else:
            self.data, self.image_mappings = {}, {}
        self.md_path = self.data.get('source_md_path')
        super().__init__(parent, title)

    def body(self, master):
        self.winfo_toplevel().minsize(950, 700)
        # FIX: Ensure the master frame provided by the dialog expands to fill the window
        master.pack(fill=tk.BOTH, expand=True)
        DropTarget(self, callback=self.handle_drop)

        self.main_frame = ttk.Frame(master)
        self.main_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        self.main_frame.columnconfigure(1, weight=1)
        self.main_frame.rowconfigure(9, weight=1)

        ttk.Label(self.main_frame, text="Title:").grid(row=0, column=0, sticky="w", pady=2, padx=5)
        self.title_var = tk.StringVar(self.main_frame, value=self.data.get('title', ''))
        self.title_entry = ttk.Entry(self.main_frame, textvariable=self.title_var)
        self.title_entry.grid(row=0, column=1, sticky="ew", padx=5)

        ttk.Label(self.main_frame, text="Subtitle:").grid(row=1, column=0, sticky="w", pady=2, padx=5)
        self.subtitle_var = tk.StringVar(self.main_frame, value=self.data.get('subtitle', ''))
        ttk.Entry(self.main_frame, textvariable=self.subtitle_var).grid(row=1, column=1, sticky="ew", padx=5)
        
        ttk.Label(self.main_frame, text="Publish Date (YYYY-MM-DD):").grid(row=2, column=0, sticky="w", pady=2, padx=5)
        self.date_var = tk.StringVar(self.main_frame, value=self.data.get('publish_date', datetime.date.today().isoformat()))
        ttk.Entry(self.main_frame, textvariable=self.date_var).grid(row=2, column=1, sticky="ew", padx=5)
        
        self.spotlight_var = tk.BooleanVar(self.main_frame, value=bool(self.data.get('is_spotlight', False)))
        ttk.Checkbutton(self.main_frame, text="Set as Spotlight Article", variable=self.spotlight_var).grid(row=3, column=1, sticky="w", pady=5, padx=5)
        
        ttk.Separator(self.main_frame, orient='horizontal').grid(row=4, column=0, columnspan=2, sticky='ew', pady=10)
        
        ttk.Button(self.main_frame, text="Select Source Markdown File...", command=self.select_md).grid(row=5, column=0, columnspan=2, sticky='ew', padx=5, pady=5)
        self.md_path_var = tk.StringVar(self.main_frame, value=self.md_path or "No .md file selected")
        ttk.Label(self.main_frame, textvariable=self.md_path_var, foreground="blue", wraplength=800).grid(row=6, column=0, columnspan=2, padx=5, pady=(0,5))
        
        ttk.Separator(self.main_frame, orient='horizontal').grid(row=7, column=0, columnspan=2, sticky='ew', pady=10)
        
        ttk.Label(self.main_frame, text="Image Mapping", font=("", 11, "bold")).grid(row=8, column=0, columnspan=2, sticky='w', padx=5)
        self.image_map_outer_frame = ttk.Frame(self.main_frame)
        self.image_map_outer_frame.grid(row=9, column=0, columnspan=2, sticky='nsew', padx=5, pady=5)
        self.image_map_outer_frame.rowconfigure(0, weight=1)
        self.image_map_outer_frame.columnconfigure(0, weight=1)
        
        canvas = tk.Canvas(self.image_map_outer_frame, borderwidth=0)
        scrollbar = ttk.Scrollbar(self.image_map_outer_frame, orient="vertical", command=canvas.yview)
        self.image_map_frame = ttk.Frame(canvas)
        self.image_map_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=self.image_map_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        if self.md_path:
            self.populate_image_mapper()
            
        return self.title_entry

    def handle_drop(self, file_path):
        p = simpledialog.askstring("Assign Dropped Image", "Enter the original placeholder path from your .md file (e.g., /articles/images/1-1.jpg or HERO_IMAGE) to assign this image to:", parent=self)
        if p and p in self.image_widgets:
            self.upload_and_set_path(p, self.image_widgets[p]['path'], source_path=file_path)

    def select_md(self):
        fp = filedialog.askopenfilename(title="Select Markdown Source", filetypes=[("Markdown Files", "*.md")])
        if fp:
            self.md_path = fp
            self.md_path_var.set(fp)
            self.populate_image_mapper()
            
    def populate_image_mapper(self):
        for w in self.image_map_frame.winfo_children(): w.destroy()
        if not self.md_path: return
        try:
            # FIX: Use the full, absolute path to read the source file
            full_path_to_md = BASE_DIR / self.md_path
            with open(full_path_to_md, 'r', encoding='utf-8') as f: content = f.read()
            
            md_paths = re.findall(r'!\[.*?\]\((.*?)\)', content)
            html_paths = re.findall(r'<img src="(.*?)"', content)
            self.placeholders = sorted(list(set(md_paths + html_paths)))
            self.placeholders.insert(0, "HERO_IMAGE")
            self.image_widgets = {}

            for i, p in enumerate(self.placeholders):
                is_hero = p == "HERO_IMAGE"
                display_name = "HERO IMAGE" if is_hero else Path(p).name
                
                ttk.Label(self.image_map_frame, text=f"{display_name}:", font=("", 10, "bold" if is_hero else "normal")).grid(row=i, column=0, sticky="w", padx=5, pady=3)
                
                path_val = self.data.get('hero_image_path') if is_hero else self.image_mappings.get(p, {}).get('path')
                path_v = tk.StringVar(self, value=path_val or 'Not Set')
                
                ttk.Label(self.image_map_frame, textvariable=path_v, foreground="blue", wraplength=250).grid(row=i, column=1, sticky="w", padx=5)
                
                btn_f = ttk.Frame(self.image_map_frame)
                btn_f.grid(row=i, column=2, sticky="w")
                ttk.Button(btn_f, text="Upload...", command=lambda p=p, v=path_v, idx=i: self.set_image_path(p, v, idx, upload=True)).pack(side=tk.LEFT, padx=2)
                ttk.Button(btn_f, text="Link...", command=lambda p=p, v=path_v: self.set_image_path(p, v, 0, upload=False)).pack(side=tk.LEFT, padx=2)
                ttk.Button(btn_f, text="Web Link...", command=lambda v=path_v: self.set_web_link(v)).pack(side=tk.LEFT, padx=2)
                
                width_v = tk.StringVar(self)
                if not is_hero:
                    entry = ttk.Entry(self.image_map_frame, textvariable=width_v, width=5)
                    entry.grid(row=i, column=4, sticky="w")
                    
                    initial_width = self.image_mappings.get(p, {}).get('width')
                    if initial_width is not None and initial_width != '':
                        entry.insert(0, str(initial_width))
                        entry.config(foreground='black')
                    else:
                        entry.insert(0, "80")
                        entry.config(foreground='grey')
                    
                    entry.bind("<FocusIn>", lambda e, v=width_v: self.on_focus_in(e, v))
                    entry.bind("<FocusOut>", lambda e, v=width_v: self.on_focus_out(e, v))
                    ttk.Label(self.image_map_frame, text="Width (%):").grid(row=i, column=3, sticky="e", padx=(15, 2))
                
                self.image_widgets[p] = {'path': path_v, 'width': width_v}
            self.image_map_frame.columnconfigure(1, weight=1)
        except Exception as e:
            ttk.Label(self.image_map_frame, text=f"Error reading Markdown: {e}", wraplength=500).pack()

    def on_focus_in(self, event, var):
        if event.widget.cget('foreground') == 'grey':
            var.set('')
            event.widget.config(foreground='black')
    def on_focus_out(self, event, var):
        if not var.get():
            var.set('80')
            event.widget.config(foreground='grey')

    def set_image_path(self, placeholder, path_var, placeholder_index, upload=False):
        if upload:
            source_path = Path(filedialog.askopenfilename(title="Select Image to Upload", filetypes=[("Images", "*.jpg")]))
            if source_path.is_file():
                self.upload_and_set_path(placeholder, path_var, source_path)
        else:
            filepath = filedialog.askopenfilename(title="Link Existing Image", initialdir=IMAGES_DIR, filetypes=[("Images", "*.jpg")])
            if filepath:
                path_var.set(Path(filepath).relative_to(BASE_DIR).as_posix())

    def upload_and_set_path(self, placeholder, path_var, source_path):
        try:
            article_order_res, _ = self.db.get_article_data(self.article_id) if self.article_id else (None, None)
            article_order = article_order_res['article_order'] if article_order_res else (self.db._execute("SELECT MAX(article_order) FROM articles").fetchone()[0] or 0) + 1
            
            img_num_list = [p for p in self.placeholders if p != "HERO_IMAGE"]
            try:
                img_num = img_num_list.index(placeholder) + 1
            except ValueError:
                img_num = len(img_num_list) + 1
            
            img_id = "hero" if placeholder == "HERO_IMAGE" else img_num
            new_filename = f"{article_order}-{img_id}.jpg"
            dest_path = IMAGES_DIR / new_filename
            shutil.copy(source_path, dest_path)
            path_var.set(dest_path.relative_to(BASE_DIR).as_posix())
        except Exception as e:
            messagebox.showerror("Error", f"Failed to upload image: {e}", parent=self)

    def set_web_link(self, path_var):
        url = simpledialog.askstring("Set Web Link", "Enter the full URL of the image:", parent=self)
        if url:
            path_var.set(url)

    def apply(self):
        self.image_mappings.clear()
        hero_path = None
        for p, w in self.image_widgets.items():
            path = w['path'].get()
            if path and path != "Not Set":
                width_val = w['width'].get()
                # Correctly handle saving the width value, including default
                width = None
                if width_val.isdigit():
                    width = int(width_val)
                
                details = {'path': path, 'width': width}
                if p == "HERO_IMAGE":
                    hero_path = path
                else:
                    self.image_mappings[p] = details
        self.result = {"data": {"title": self.title_var.get(), "subtitle": self.subtitle_var.get(), "publish_date": self.date_var.get(), "hero_image_path": hero_path, "source_md_path": self.md_path, "is_spotlight": 1 if self.spotlight_var.get() else 0}, "image_mappings": self.image_mappings}
    
    def validate(self):
        if not all([self.title_var.get(), self.date_var.get(), self.md_path]):
            messagebox.showerror("Error", "Title, Date, and a Source File are required.", parent=self)
            return False
        try:
            datetime.datetime.strptime(self.date_var.get(), '%Y-%m-%d')
        except ValueError:
            messagebox.showerror("Error", "Date must be in YYYY-MM-DD format.", parent=self)
            return False
        return True


class App(TkinterDnD.Tk):
    def __init__(self):
        super().__init__(); self.title("Articles Manager"); self.geometry("1000x700")
        self.db = DatabaseManager(DB_PATH); self.build_ui(); self.refresh_articles()

    def build_ui(self):
        main_frame = ttk.Frame(self, padding="10"); main_frame.pack(fill=tk.BOTH, expand=True)
        tree_frame = ttk.Frame(main_frame); tree_frame.pack(fill=tk.BOTH, expand=True)
        self.tree = ttk.Treeview(tree_frame, columns=("Title", "Date"), show="headings")
        self.tree.heading("Title", text="Title"); self.tree.heading("Date", text="Publish Date")
        self.tree.column("Date", width=120, anchor="center"); self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree.yview); self.tree.configure(yscrollcommand=scrollbar.set); scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        btn_frame = ttk.Frame(main_frame); btn_frame.pack(fill=tk.X, pady=(10,0))
        ttk.Button(btn_frame, text="Add Article...", command=self.add_article).pack(side=tk.LEFT)
        ttk.Button(btn_frame, text="Edit Selected...", command=self.edit_article).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Delete Selected", command=self.delete_article).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Publish Website", command=self.publish_all, style="Accent.TButton").pack(side=tk.RIGHT)
        ttk.Style(self).configure("Accent.TButton", font=("", 10, "bold"))

    def _handle_md_copy(self, external_md_path, publish_date):
        dest_dir = INTERNAL_SOURCES_DIR / publish_date
        dest_dir.mkdir(exist_ok=True, parents=True)
        dest_path = dest_dir / "source.md"
        shutil.copy(external_md_path, dest_path)
        return dest_path.relative_to(BASE_DIR).as_posix()

    def refresh_articles(self):
        self.tree.delete(*self.tree.get_children())
        for article in self.db.get_all_articles(): self.tree.insert("", "end", iid=article['id'], values=(article['title'], article['publish_date']))

    def add_article(self):
        try:
            dialog = ArticleDialog(self, self.db, "Add New Article")
            if dialog.result:
                internal_md_path = self._handle_md_copy(dialog.result['data']['source_md_path'], dialog.result['data']['publish_date'])
                dialog.result['data']['source_md_path'] = internal_md_path
                article_id = self.db.add_article(dialog.result['data'], dialog.result['image_mappings'])
                HTMLGenerator(self.db, article_id).generate()
        finally: self.refresh_articles()

    def edit_article(self):
        selected_id = self.tree.selection()
        if not selected_id: return
        try:
            original_data, _ = self.db.get_article_data(selected_id[0])
            dialog = ArticleDialog(self, self.db, "Edit Article", article_id=selected_id[0])
            if dialog.result:
                new_data = dialog.result['data']
                
                # If the user selected a new external MD file, copy it to overwrite the internal one.
                if new_data['source_md_path'] != original_data['source_md_path']:
                    new_internal_path = self._handle_md_copy(new_data['source_md_path'], new_data['publish_date'])
                    new_data['source_md_path'] = new_internal_path
                
                # If the date changed, move the whole article directory
                if new_data['publish_date'] != original_data['publish_date']:
                    old_dir = ARTICLES_DIR / original_data['publish_date']
                    new_dir = ARTICLES_DIR / new_data['publish_date']
                    if old_dir.exists():
                        shutil.move(str(old_dir), str(new_dir))
                        # Update the path in the database to the new location
                        new_data['source_md_path'] = (new_dir / "source.md").relative_to(BASE_DIR).as_posix()

                self.db.update_article(selected_id[0], new_data, dialog.result['image_mappings'])
                HTMLGenerator(self.db, selected_id[0]).generate()
        finally: self.refresh_articles()

    def delete_article(self):
        selected_id = self.tree.selection()
        if not selected_id: return
        if messagebox.askyesno("Confirm Delete", "This will delete the article from the database AND its generated HTML folder. This cannot be undone."):
            self.db.delete_article(selected_id[0]); self.refresh_articles()

    def publish_all(self):
        if not messagebox.askyesno("Confirm Publish", "This will republish ALL article HTML files and the main article index. This is the only action needed to make your site live. Continue?"): return
        all_articles = self.db.get_all_articles()
        progress = ttk.Progressbar(self, length=300, mode='determinate'); progress.pack(pady=5); progress['maximum'] = len(all_articles)
        for i, article in enumerate(all_articles):
            HTMLGenerator(self.db, article['id']).generate()
            progress['value'] = i + 1; self.update_idletasks()
        publish_data = [dict(row) for row in all_articles]
        try:
            with open(JSON_OUTPUT_PATH, 'w', encoding='utf-8') as f: json.dump(publish_data, f, indent=2, ensure_ascii=False)
            messagebox.showinfo("Success", f"All articles and the main index have been published to the website.")
        except Exception as e: messagebox.showerror("Error", f"Failed to publish index: {e}")
        progress.destroy()

if __name__ == "__main__":
    app = App()
    app.mainloop()
