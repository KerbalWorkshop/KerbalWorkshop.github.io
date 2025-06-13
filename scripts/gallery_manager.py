#!/usr/bin/env python3
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
from PIL import Image, ImageFile, ImageTk
from pathlib import Path
import sqlite3, json, shutil, uuid, traceback, re, os, io, math
from platform import system

# --- CONFIGURATION ---
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "gallery.db"
ORIG_DIR = BASE_DIR / "photos" / "originals"
THUMB_DIR = BASE_DIR / "photos" / "thumbs"
DATA_DIR = BASE_DIR / "photos" / "data"

for p in [DB_PATH.parent, ORIG_DIR, THUMB_DIR, DATA_DIR]:
    p.mkdir(parents=True, exist_ok=True)

THUMB_SIZE = (400, 400)
PREVIEW_MAX_H = 300
ImageFile.LOAD_TRUNCATED_IMAGES = True

CAMERAS = ["", "Nikon D3300", "ZWO ASI662MC", "ZWO ASI2600MM Pro"]
TELESCOPES = ["", "Celestron C8-N", "William Optics RedCat 51"]
GALLERY_NAMES = ["Messier", "Highlights", "Solar System"]

# --- HELPER CLASSES ---
class RotatableBox:
    """A class to draw and manage a rotatable, resizable box on a canvas."""
    def __init__(self, canvas, square_mode_var, on_draw_callback=None):
        self.canvas = canvas
        self.square_mode = square_mode_var
        self.on_draw_callback = on_draw_callback # Accept the callback
        self.shape_id = None
        self.handles = []
        self.center_x, self.center_y, self.width, self.height, self.angle = 0, 0, 0, 0, 0.0
        self._drag_data = {"x": 0, "y": 0, "mode": "idle", "handle_index": -1}

        # This single set of bindings controls all actions
        self.canvas.bind("<ButtonPress-1>", self._on_press)
        self.canvas.bind("<B1-Motion>", self._on_motion)
        self.canvas.bind("<ButtonRelease-1>", self._on_release)

    def _on_press(self, event):
        item = self.canvas.find_withtag(tk.CURRENT)
        if item and "handle" in self.canvas.gettags(item[0]):
            self._on_handle_press(event, item[0])
        else:
            self._drag_data["mode"] = "draw"
            self.center_x, self.center_y = event.x, event.y
            self.angle, self.width, self.height = 0, 0, 0
            self._draw()

    def _on_motion(self, event):
        mode = self._drag_data["mode"]
        if mode == "idle": return

        if mode == "draw":
            dx = event.x - self.center_x
            dy = event.y - self.center_y
            self.angle = 0
            if self.square_mode.get(): self.width = self.height = max(abs(dx), abs(dy)) * 2
            else: self.width, self.height = abs(dx) * 2, abs(dy) * 2
        
        elif mode == "resize":
            handle_index = self._drag_data["handle_index"]
            corners = self.get_rotated_corners()
            if handle_index >= len(corners): return
            fixed_corner = corners[(handle_index + 2) % 4]
            
            self.center_x = (event.x + fixed_corner[0]) / 2
            self.center_y = (event.y + fixed_corner[1]) / 2
            
            dx = event.x - self.center_x
            dy = event.y - self.center_y
            
            cos_a, sin_a = math.cos(-self.angle), math.sin(-self.angle)
            unrotated_dx = dx * cos_a - dy * sin_a
            unrotated_dy = dx * sin_a + dy * cos_a
            
            self.width = abs(unrotated_dx) * 2
            self.height = self.width if self.square_mode.get() else abs(unrotated_dy) * 2
        
        elif mode == "rotate":
            self.angle = math.atan2(event.y - self.center_y, event.x - self.center_x)

        self._draw()
        # This line calls the callback to update the buttons
        if self.on_draw_callback:
            self.on_draw_callback()
        
    def _on_handle_press(self, event, item_id):
        if item_id in self.handles:
            self._drag_data["handle_index"] = self.handles.index(item_id)
            # The 5th handle is the rotation handle
            if self._drag_data["handle_index"] == 4:
                self._drag_data["mode"] = "rotate"
            else:
                self._drag_data["mode"] = "resize"
    
    def _on_release(self, event):
        self._drag_data["mode"] = "idle"
        self._drag_data["handle_index"] = -1

    def _on_handle_enter(self, event):
        item = self.canvas.find_withtag(tk.CURRENT)
        if item and "handle" in self.canvas.gettags(item[0]) and self.handles.index(item[0]) == 4:
            self.canvas.config(cursor="exchange")
        else:
            self.canvas.config(cursor="sizing")

    def _on_handle_leave(self, event):
        self.canvas.config(cursor="crosshair")

    def _draw(self):
        if self.shape_id: self.canvas.delete(self.shape_id)
        for h in self.handles: self.canvas.delete(h)
        self.handles.clear()
        
        points = self.get_rotated_corners()
        if not points or self.width < 1 or self.height < 1:
            self.shape_id = None
            return
            
        flat_points = [coord for point in points for coord in point]
        self.shape_id = self.canvas.create_polygon(flat_points, outline='red', fill='', width=2, tags="box")
        
        for x, y in points:
            self.handles.append(self.canvas.create_oval(x-4, y-4, x+4, y+4, fill='red', outline='white', tags="handle"))
        
        if not self.square_mode.get():
            top_right_x, top_right_y = points[1]
            vec_x, vec_y = top_right_x - self.center_x, top_right_y - self.center_y
            dist = math.hypot(vec_x, vec_y)
            if dist == 0: return
            rot_handle_x = self.center_x + vec_x / dist * (dist + 20)
            rot_handle_y = self.center_y + vec_y / dist * (dist + 20)
            self.handles.append(self.canvas.create_oval(rot_handle_x-5, rot_handle_y-5, rot_handle_x+5, rot_handle_y+5, fill='blue', outline='white', tags="handle"))

    def get_rotated_corners(self):
        w2, h2 = self.width / 2, self.height / 2
        unrotated = [(-w2, -h2), (w2, -h2), (w2, h2), (-w2, h2)]
        cos_a, sin_a = math.cos(self.angle), math.sin(self.angle)
        
        rotated = [(x * cos_a - y * sin_a, x * sin_a + y * cos_a) for x, y in unrotated]
        return [(x + self.center_x, y + self.center_y) for x, y in rotated]

    def get_scaled_and_clamped_corners(self, scale_factor, pad_x, pad_y, img_w, img_h):
        if not self.shape_id: return None
        return [(max(0,min(img_w,int((x-pad_x)*scale_factor))), max(0,min(img_h,int((y-pad_y)*scale_factor)))) for x,y in self.get_rotated_corners()]
    

class SubjectMarkerWindow(tk.Toplevel):
    def __init__(self, parent, image_path, subjects_to_mark):
        super().__init__(parent)
        self.transient(parent)
        self.grab_set()
        self.title("Mark Subject Locations")
        self.geometry("800x700")

        self.image_path = image_path
        self.subjects = subjects_to_mark
        self.current_subject_index = 0
        self.results = {}  # Final results to be returned
        self.current_marks = {}  # Temp data for the subject currently being marked

        # --- UI Elements ---
        self.subject_label = ttk.Label(self, text="", font=("Helvetica", 14, "bold"))
        self.subject_label.pack(pady=(10, 5))

        self.canvas = tk.Canvas(self, bg="gray20", cursor="crosshair")
        self.canvas.pack(fill="both", expand=True, padx=10, pady=5)

        # --- Config Row ---
        config_frame = ttk.Frame(self, padding=(0, 5))
        config_frame.pack(fill='x', padx=10)
        self.square_mode_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(config_frame, text="Force Square Shape", variable=self.square_mode_var, command=self.reset_drawing).pack(side='left')

        # --- Actions Section ---
        actions_outer_frame = ttk.Frame(self, padding=(0, 5))
        actions_outer_frame.pack(fill='x', padx=10)
        actions_outer_frame.columnconfigure(1, weight=1)

        # Left Column: Buttons
        button_container = ttk.Frame(actions_outer_frame)
        button_container.grid(row=0, column=0, sticky='ns')
        
        self.coords_frame = ttk.Frame(button_container)
        self.coords_frame.pack(fill='x', pady=2)
        self.coords_status = ttk.Label(self.coords_frame, text="◯", foreground="grey")
        self.coords_status.pack(side='left')
        ttk.Button(self.coords_frame, text="Save Coordinates", command=self.save_coords).pack(side='left', padx=5)

        self.thumb_frame = ttk.Frame(button_container)
        self.thumb_frame.pack(fill='x', pady=2)
        self.thumb_status = ttk.Label(self.thumb_frame, text="◯", foreground="grey")
        self.thumb_status.pack(side='left')
        self.thumb_button = ttk.Button(self.thumb_frame, text="Save Thumbnail Area", command=self.save_thumb_area, state="disabled")
        self.thumb_button.pack(side='left', padx=5)

        style = ttk.Style()
        style.configure("Accent.TButton", font=("Helvetica", 10, "bold"))
        # --- FIX: Store a reference to the button ---
        self.save_both_button = ttk.Button(button_container, text="Save Both", command=self.save_both, style="Accent.TButton", state="disabled")
        self.save_both_button.pack(fill='x', pady=2)

        # Right Column: Help Text
        help_text = ("Draw a box around the subject on the image.\n\n"
                     "- Save Coordinates: Saves the box as the subject's location.\n"
                     "- Save Thumbnail Area: Saves the box to create a thumbnail.\n"
                     "- Save Both: Does both at once.\n\n"
                     "You can save multiple times. Click 'Next' when you are done with the current subject.")
        help_label = ttk.Label(actions_outer_frame, text=help_text, wraplength=400, justify='left', style='TLabel')
        help_label.grid(row=0, column=1, sticky='w', padx=20)

        # --- Navigation Row ---
        nav_frame = ttk.Frame(self, padding=(0, 10))
        nav_frame.pack(fill='x', padx=10)
        self.next_button = ttk.Button(nav_frame, text="Next Subject ==>", command=self.next_subject)
        self.next_button.pack(side='right')

        self.protocol("WM_DELETE_WINDOW", self.on_close)
        self.load_image_for_current_subject()

    def load_image_for_current_subject(self):
        self.current_marks = {} # Reset for the new subject
        self.update_status_indicators()
        
        subject = self.subjects[self.current_subject_index]
        self.subject_label.config(text=f"Marking for: {subject['name']}")
        
        with Image.open(self.image_path) as img:
            self.original_w, self.original_h = img.size
            self.canvas.update()
            canvas_w, canvas_h = self.canvas.winfo_width(), self.canvas.winfo_height()
            ratio = min(canvas_w / self.original_w, canvas_h / self.original_h)
            self.resized_w, self.resized_h = int(self.original_w * ratio), int(self.original_h * ratio)
            self.pad_x = (canvas_w - self.resized_w) / 2
            self.pad_y = (canvas_h - self.resized_h) / 2
            resized_img = img.resize((self.resized_w, self.resized_h), Image.Resampling.LANCZOS)
            self.photo = ImageTk.PhotoImage(resized_img)
        
        self.canvas.delete("all")
        self.canvas.create_image(self.pad_x, self.pad_y, image=self.photo, anchor="nw")
        
        # This must be called AFTER the image is loaded and canvas is ready
        self.reset_drawing()

        if self.current_subject_index == len(self.subjects) - 1:
            self.next_button.config(text="Finish & Submit")

    def reset_drawing(self):
        if hasattr(self, 'cropper') and self.cropper:
            if self.cropper.shape_id:
                self.canvas.delete(self.cropper.shape_id)
            for h in self.cropper.handles:
                self.canvas.delete(h)
        self.cropper = RotatableBox(self.canvas, self.square_mode_var, on_draw_callback=self.update_button_states)
        self.update_button_states()

    def update_button_states(self):
        # Thumbnail buttons are only active if a square is drawn
        is_square = self.square_mode_var.get()
        box_exists = self.cropper and self.cropper.shape_id is not None
        
        thumb_state = "normal" if (is_square and box_exists) else "disabled"
        self.thumb_button.config(state=thumb_state)
        # --- FIX: Use the direct reference to the button ---
        self.save_both_button.config(state=thumb_state)

    def update_status_indicators(self):
        self.coords_status.config(text="✔" if 'bbox_coords' in self.current_marks else "◯", 
                                  foreground="green" if 'bbox_coords' in self.current_marks else "grey")
        self.thumb_status.config(text="✔" if 'thumb_coords' in self.current_marks else "◯",
                                 foreground="green" if 'thumb_coords' in self.current_marks else "grey")

    def save_coords(self):
        coords = self.cropper.get_scaled_and_clamped_corners(self.original_w/self.resized_w, self.pad_x, self.pad_y, self.original_w, self.original_h)
        self.current_marks['bbox_coords'] = coords if coords else "null"
        self.update_status_indicators()

    def save_thumb_area(self):
        coords = self.cropper.get_scaled_and_clamped_corners(self.original_w/self.resized_w, self.pad_x, self.pad_y, self.original_w, self.original_h)
        if not coords: return # Should be disabled, but as a safeguard
        self.current_marks['thumb_coords'] = coords
        self.update_status_indicators()

    def save_both(self):
        coords = self.cropper.get_scaled_and_clamped_corners(self.original_w/self.resized_w, self.pad_x, self.pad_y, self.original_w, self.original_h)
        if not coords: return # Should be disabled, but as a safeguard
        self.current_marks['bbox_coords'] = coords
        self.current_marks['thumb_coords'] = coords
        self.update_status_indicators()

    def next_subject(self):
        subject_id = self.subjects[self.current_subject_index]['id']
        if self.current_marks:
            self.results[subject_id] = self.current_marks
        
        if self.current_subject_index < len(self.subjects) - 1:
            self.current_subject_index += 1
            self.load_image_for_current_subject()
        else:
            self.destroy()

    def on_close(self):
        if not self.results or messagebox.askyesno("Cancel?", "Are you sure you want to cancel marking? Any unsaved markings will be lost.", parent=self):
            self.results = None
            self.destroy()

    
class ScrollableFrame(ttk.Frame):
    """A scrollable frame widget that can contain other widgets."""
    def __init__(self, container, *args, **kwargs):
        super().__init__(container, *args, **kwargs)
        self.canvas = tk.Canvas(self, borderwidth=0, highlightthickness=0)
        vsb = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.inner = ttk.Frame(self.canvas)

        self.inner.bind("<Configure>", lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        
        self.canvas.create_window((0, 0), window=self.inner, anchor="nw")
        self.canvas.configure(yscrollcommand=vsb.set)
        
        self.canvas.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")

        # --- FIX: Bind mousewheel event directly to the canvas ---
        # This is safer than using bind_all, as the binding is
        # automatically removed when this widget is destroyed.
        self.canvas.bind("<MouseWheel>", self._on_mousewheel)
        self.inner.bind("<MouseWheel>", self._on_mousewheel) # Also bind to inner frame

    def _on_mousewheel(self, event):
        # The actual scroll action
        # The direction of scroll is different on Windows/macOS vs. Linux
        if system() == "Linux":
            if event.num == 4:
                self.canvas.yview_scroll(-1, "units")
            elif event.num == 5:
                self.canvas.yview_scroll(1, "units")
        else: # For Windows and macOS
            self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    # --- FIX: The old, buggy binding methods are now removed ---

class MultiSelectSearchableList(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self.all_items = []
        self.displayed_item_map = {}
        self.selected_ids = set()

        filter_frame = ttk.Frame(self)
        filter_frame.pack(fill='x', pady=(0, 5))
        ttk.Label(filter_frame, text="Filter:").pack(side='left')
        self.filter_var = tk.StringVar()
        self.filter_var.trace_add("write", self._filter_list)
        filter_entry = ttk.Entry(filter_frame, textvariable=self.filter_var)
        filter_entry.pack(side='left', fill='x', expand=True, padx=5)

        list_frame = ttk.Frame(self)
        list_frame.pack(fill='both', expand=True)
        self.listbox = tk.Listbox(list_frame, selectmode=tk.SINGLE, exportselection=False)
        self.listbox.pack(side='left', fill='both', expand=True)
        list_scrollbar = ttk.Scrollbar(list_frame, orient="vertical", command=self.listbox.yview)
        list_scrollbar.pack(side='right', fill='y')
        self.listbox.config(yscrollcommand=list_scrollbar.set)
        self.listbox.bind("<Button-1>", self._toggle_selection_event)

        ttk.Button(self, text="Deselect All", command=self.deselect_all).pack(fill='x', pady=(5,0))

    def populate_items(self, items):
        self.all_items = items
        self._filter_list()

    def _populate_listbox(self, items):
        self.listbox.delete(0, tk.END)
        self.displayed_item_map.clear()
        for i, item in enumerate(items):
            self.listbox.insert(tk.END, item['name'])
            self.displayed_item_map[i] = item
            if item['id'] in self.selected_ids:
                self.listbox.itemconfig(i, {'bg': 'SteelBlue', 'fg': 'white'})

    def _filter_list(self, *args):
        query = self.filter_var.get().lower()
        filtered_items = [item for item in self.all_items if query in item['name'].lower()] if query else self.all_items
        self._populate_listbox(filtered_items)
    
    def _toggle_selection_event(self, event):
        idx = event.widget.nearest(event.y)
        if idx < 0:
            return
        
        item = self.displayed_item_map.get(idx)
        if not item:
            return

        if item['id'] in self.selected_ids:
            self.selected_ids.remove(item['id'])
            event.widget.itemconfig(idx, {'bg': '', 'fg': ''})
        else:
            self.selected_ids.add(item['id'])
            event.widget.itemconfig(idx, {'bg': 'SteelBlue', 'fg': 'white'})
        
        self.listbox.selection_clear(0, tk.END)

    def get_selection(self):
        return list(self.selected_ids)

    def set_selection(self, id_list):
        self.selected_ids = set(id_list)
        self._filter_list()
    
    def deselect_all(self):
        self.set_selection([])

class EditImageWindow(tk.Toplevel):
    def __init__(self, parent, image_id):
        super().__init__(parent)
        self.db = parent.db
        self.image_id = image_id
        self.transient(parent)
        self.grab_set()
        self.title("Edit Image Details")
        self.geometry("800x800")
        
        self.image_data = self.db.get_image_details(self.image_id)
        if not self.image_data:
            messagebox.showerror("Error", "Could not load image data.", parent=parent)
            self.destroy()
            return

        self.edit_label = tk.StringVar(value=self.image_data.get('label'))
        self.edit_date = tk.StringVar(value=self.image_data.get('date'))
        self.edit_integration = tk.StringVar(value=self.image_data.get('integration') or "")
        self.edit_camera = tk.StringVar(value=self.image_data.get('camera'))
        self.edit_telescope = tk.StringVar(value=self.image_data.get('telescope'))
        self.edit_gallery_vars = {}
        self.new_marker_data = None
        self.confirmed_edits = None

        scrollable_area = ScrollableFrame(self)
        scrollable_area.pack(fill="both", expand=True)
        main_frame = scrollable_area.inner

        meta_frame = ttk.LabelFrame(main_frame, text="Metadata", padding="10")
        meta_frame.pack(fill='x', expand=True, padx=10, pady=5)
        meta_frame.columnconfigure(1, weight=1)
        fields = {"Label:": self.edit_label, "Date (YYYY-MM-DD):": self.edit_date, "Integration (min):": self.edit_integration, "Camera:": self.edit_camera, "Telescope:": self.edit_telescope}
        for i, (label, var) in enumerate(fields.items()):
            ttk.Label(meta_frame, text=label).grid(row=i, column=0, sticky='w', padx=5, pady=3)
            if "Camera" in label: ttk.Combobox(meta_frame, textvariable=var, values=CAMERAS, state="readonly").grid(row=i, column=1, sticky='we', padx=5, pady=3)
            elif "Telescope" in label: ttk.Combobox(meta_frame, textvariable=var, values=TELESCOPES, state="readonly").grid(row=i, column=1, sticky='we', padx=5, pady=3)
            else: ttk.Entry(meta_frame, textvariable=var).grid(row=i, column=1, sticky='we', padx=5, pady=3)
        
        ttk.Label(meta_frame, text="Notes:").grid(row=len(fields), column=0, sticky='nw', padx=5, pady=3)
        self.edit_notes = scrolledtext.ScrolledText(meta_frame, height=4)
        self.edit_notes.grid(row=len(fields), column=1, sticky='we', padx=5, pady=3)
        self.edit_notes.insert("1.0", self.image_data.get('notes') or "")
        
        assign_frame = ttk.LabelFrame(main_frame, text="Assignments", padding="10")
        assign_frame.pack(fill='both', expand=True, padx=10, pady=5)
        assign_frame.columnconfigure(0, weight=1)
        assign_frame.rowconfigure(0, weight=1)
        
        subject_frame = ttk.LabelFrame(assign_frame, text="Subjects")
        subject_frame.grid(row=0, column=0, sticky='nsew', padx=(0,5))
        subject_frame.rowconfigure(0, weight=1)
        subject_frame.columnconfigure(0, weight=1)
        self.subject_chooser = MultiSelectSearchableList(subject_frame)
        self.subject_chooser.pack(fill='both', expand=True, padx=5, pady=5)
        self.subject_chooser.populate_items(self.db.get_subjects())
        self.subject_chooser.set_selection([s['id'] for s in self.image_data.get('subjects', [])])
        
        right_panel = ttk.Frame(assign_frame)
        right_panel.grid(row=0, column=1, sticky='ns', padx=(5,0))
        gallery_frame_inner = ttk.LabelFrame(right_panel, text="Galleries", padding="10")
        gallery_frame_inner.pack(fill='x', expand=False)
        for gal in self.db.get_galleries():
            var = tk.BooleanVar(value=(gal['id'] in self.image_data.get('gallery_ids', [])))
            self.edit_gallery_vars[gal['id']] = var
            ttk.Checkbutton(gallery_frame_inner, text=gal['name'], variable=var).pack(anchor='w')
        
        marking_frame = ttk.LabelFrame(right_panel, text="Markings", padding="10")
        marking_frame.pack(fill='x', expand=False, pady=10)
        ttk.Button(marking_frame, text="Update Markings...", command=self.remake_markings).pack(pady=5)
        
        btn_frame = ttk.Frame(main_frame)
        btn_frame.pack(pady=15, side='bottom')
        ttk.Button(btn_frame, text="Save All Changes", command=self.confirm_and_close).pack(side="left", padx=10)
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).pack(side="left", padx=10)

    def confirm_and_close(self):
        self.confirmed_edits = {
            'label': self.edit_label.get().strip(), 'date': self.edit_date.get().strip(),
            'integration': int(self.edit_integration.get()) if self.edit_integration.get() else None,
            'camera': self.edit_camera.get().strip(), 'telescope': self.edit_telescope.get().strip(),
            'notes': self.edit_notes.get("1.0", "end").strip(),
            'gallery_ids': [gid for gid, var in self.edit_gallery_vars.items() if var.get()],
            'subject_ids': self.subject_chooser.get_selection()
        }
        self.destroy()

    def remake_markings(self):
        subjects_to_mark = [s for s in self.db.get_subjects() if s['id'] in self.subject_chooser.get_selection()]
        if not subjects_to_mark:
            messagebox.showinfo("No Subjects Selected", "You must select subjects in the list before you can create markings.", parent=self)
            return

        full_image_path = BASE_DIR / self.image_data['file_path']
        marker_window = SubjectMarkerWindow(self, full_image_path, subjects_to_mark)
        self.wait_window(marker_window)
        
        if marker_window.results is not None:
            self.new_marker_data = marker_window.results

# --- DATABASE MANAGEMENT ---
# --- DATABASE MANAGEMENT ---
class DatabaseManager:
    def __init__(self, db_path):
        self.db_path = db_path
        self.conn = sqlite3.connect(str(db_path))
        self.conn.row_factory = sqlite3.Row
        self.init_db()

    def _execute(self, q, p=(), c=False):
        cur = self.conn.cursor()
        cur.execute(q, p)
        if c:
            self.conn.commit()
        return cur

    def init_db(self):
        # Check if the database has already been initialized by looking for a key table.
        cur = self.conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='images'")
        if cur.fetchone():
            # If the images table exists, we assume the DB is correctly set up.
            # The obsolete migration code has been removed.
            return
        
        # If no tables exist, create the entire database from the schema file.
        # This now happens only once when a new database file is created.
        print("Creating new database from schema.sql...")
        try:
            with open(BASE_DIR / 'schema.sql', 'r') as f:
                self.conn.executescript(f.read())
            self.conn.commit()
        except FileNotFoundError:
            print("CRITICAL: schema.sql not found. Cannot create new database.")
            raise
        
        # Populate initial data like galleries
        for g in GALLERY_NAMES:
            self.add_gallery(g)
        print("Database creation complete.")

    def add_gallery(self, n):
        self._execute("INSERT OR IGNORE INTO galleries(name) VALUES(?)", (n, ), True)

    def get_galleries(self):
        return self._execute("SELECT id, name FROM galleries ORDER BY name").fetchall()

    def add_subject(self, n):
        self._execute("INSERT OR IGNORE INTO subjects(name) VALUES(?)", (n, ), True)

    def get_subjects(self, f=''):
        return self._execute("SELECT id, name FROM subjects WHERE name LIKE ? ORDER BY name", (f'%{f}%', )).fetchall()
    
    def get_image_subjects(self, image_id):
        return self._execute("SELECT s.id, s.name, isj.bounding_box, isj.thumb_path FROM subjects s JOIN image_subjects isj ON s.id = isj.subject_id WHERE isj.image_id = ?", (image_id,)).fetchall()

    def get_old_thumb_paths(self, image_id):
        return [row['thumb_path'] for row in self._execute("SELECT thumb_path FROM image_subjects WHERE image_id = ? AND thumb_path IS NOT NULL", (image_id, )).fetchall()]

    def delete_item(self, t, i):
        if t == "subjects":
            self._execute("DELETE FROM image_subjects WHERE subject_id=?", (i, ), True)
        elif t == "galleries":
            self.conn.execute("DELETE FROM image_galleries WHERE gallery_id=?", (i, ))
        self._execute(f"DELETE FROM {t} WHERE id=?", (i, ), True)

    def delete_all(self, t):
        if t == "subjects":
            self._execute("DELETE FROM image_subjects", (), True)
        elif t == "galleries":
            self._execute("DELETE FROM image_galleries", (), True)
        self._execute(f"DELETE FROM {t}", (), True)

    def save_image_data(self, image_data, subject_data, gallery_ids):
        cur = self.conn.cursor()
        cur.execute("INSERT INTO images(id, label, file_path, date, integration, camera, telescope, notes, width, height) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (image_data['id'], image_data['label'], image_data['file_path'], image_data['date'], image_data['integration'],
                    image_data['camera'], image_data['telescope'], image_data['notes'], image_data['width'], image_data['height']))
        
        for sid, data in subject_data.items():
            cur.execute("INSERT INTO image_subjects(image_id, subject_id, bounding_box, thumb_path) VALUES(?,?,?,?)",
                        (image_data['id'], sid, data['box'], data['thumb_path']))
        
        for gid in gallery_ids:
            cur.execute("INSERT INTO image_galleries(image_id, gallery_id) VALUES(?,?)", (image_data['id'], gid))
        
        self.conn.commit()

    def delete_image(self, image_id):
        main_img_row = self._execute("SELECT file_path FROM images WHERE id = ?", (image_id, )).fetchone()
        if main_img_row and main_img_row['file_path']:
            (BASE_DIR / main_img_row['file_path']).unlink(missing_ok=True)
            
        for path in self.get_old_thumb_paths(image_id):
            (BASE_DIR / path).unlink(missing_ok=True)
            
        self._execute("DELETE FROM images WHERE id=?", (image_id, ), True)

    def get_all_data_for_publishing(self):
        images_cursor = self._execute("SELECT * FROM images ORDER BY date DESC")
        images = {row['id']: dict(row) for row in images_cursor.fetchall()}
        
        subjects = {}
        subjects_cursor = self._execute("SELECT isj.image_id, s.id, s.name, isj.thumb_path, isj.bounding_box FROM image_subjects isj JOIN subjects s ON s.id = isj.subject_id")
        for row in subjects_cursor.fetchall():
            image_id = row['image_id']
            if image_id not in subjects:
                subjects[image_id] = []
            subjects[image_id].append(dict(row))
            
        galleries = {}
        galleries_cursor = self._execute("SELECT ig.image_id, g.id FROM image_galleries ig JOIN galleries g ON g.id = ig.gallery_id")
        for row in galleries_cursor.fetchall():
            image_id = row['image_id']
            if image_id not in galleries:
                galleries[image_id] = []
            galleries[image_id].append(row['id'])
            
        result = []
        for img_id, img_data in images.items():
            result.append({
                "id": img_id,
                "label": img_data['label'],
                "image_file": img_data['file_path'],
                "width": img_data['width'],
                "height": img_data['height'],
                "data": {
                    "date": img_data['date'], "integration": img_data['integration'],
                    "camera": img_data['camera'], "telescope": img_data['telescope'],
                    "notes": img_data['notes']
                },
                "subjects": subjects.get(img_id, []),
                "gallery_ids": galleries.get(img_id, [])
            })
        return result

    def get_image_details(self, image_id):
        img_cursor = self._execute("SELECT * FROM images WHERE id = ?", (image_id, ))
        image_data = img_cursor.fetchone()
        if not image_data:
            return None
        
        details = dict(image_data)
        details['gallery_ids'] = [row['gallery_id'] for row in self._execute("SELECT gallery_id FROM image_galleries WHERE image_id = ?", (image_id, )).fetchall()]
        details['subjects'] = [dict(row) for row in self.get_image_subjects(image_id)]
        return details

    def update_image_data(self, image_id, new_data):
        self._execute("""UPDATE images SET label=?, date=?, integration=?, camera=?, telescope=?, notes=? WHERE id=?""",
                    (new_data['label'], new_data['date'], new_data['integration'], new_data['camera'],
                    new_data['telescope'], new_data['notes'], image_id))
        
        self._execute("DELETE FROM image_galleries WHERE image_id=?", (image_id, ))
        for gid in new_data['gallery_ids']:
            self._execute("INSERT INTO image_galleries(image_id, gallery_id) VALUES(?,?)", (image_id, gid))
        
        self.conn.commit()

    def replace_subject_associations(self, image_id, new_subject_data):
        self._execute("DELETE FROM image_subjects WHERE image_id = ?", (image_id, ), c=True)
        for subject_id, data in new_subject_data.items():
            bbox_str = data.get('box')
            thumb_path = data.get('thumb_path')
            self._execute("INSERT INTO image_subjects (image_id, subject_id, bounding_box, thumb_path) VALUES (?, ?, ?, ?)",
                          (image_id, subject_id, bbox_str, thumb_path), c=True)
            

# --- MAIN APPLICATION ---
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.report_callback_exception = self.show_error
        try:
            self.db = DatabaseManager(DB_PATH)
            self.title("Astrophotography Gallery Manager")
            self.geometry("1200x800")
            
            # --- State Variables ---
            self.add_label = tk.StringVar()
            self.add_date = tk.StringVar()
            self.add_integration = tk.StringVar()
            self.add_camera = tk.StringVar()
            self.add_telescope = tk.StringVar()
            
            self.source_image_path = None
            self.preview_photo = None
            
            self.build_ui()
            self.refresh_all_tabs()
        except Exception:
            self.show_error(None, traceback.format_exc(), None)
            self.destroy()

    def show_error(self, et, ev, tb):
        err = "".join(traceback.format_exception(et, ev, tb)) if et else str(ev)
        messagebox.showerror("Unhandled Exception", f"A critical error occurred:\n\n{err}")

    def build_ui(self):
        notebook = ttk.Notebook(self)
        notebook.pack(fill="both", expand=True, padx=10, pady=10)
        
        tab_specs = {
            "Add Image": ("tab_add", self.build_tab_add),
            "Browse/Edit": ("tab_browse", self.build_tab_browse),
            "Manage Subjects": ("tab_manage_subjects", self.build_tab_subjects),
            "Manage Galleries": ("tab_manage_galleries", self.build_tab_galleries)
        }
        for text, (attr_name, builder_func) in tab_specs.items():
            frame = ScrollableFrame(notebook) if "Manage" in text or "Add" in text else ttk.Frame(notebook)
            notebook.add(frame, text=text)
            setattr(self, attr_name, frame)
            builder_func()
            
        pub_frame = ttk.Frame(notebook)
        notebook.add(pub_frame, text="Publish")
        ttk.Button(pub_frame, text="Publish All Data to Website", command=self.publish_json).pack(pady=20, padx=20)

    def build_tab_add(self):
        frame = self.tab_add.inner
        
        meta_frame = ttk.LabelFrame(frame, text="Metadata", padding="10")
        meta_frame.pack(fill='x', expand=True, padx=10, pady=5)
        meta_frame.columnconfigure(1, weight=1)
        fields = {"Label:": self.add_label, "Date (YYYY-MM-DD):": self.add_date, "Integration (min):": self.add_integration, "Camera:": self.add_camera, "Telescope:": self.add_telescope}
        for i, (label, var) in enumerate(fields.items()):
            ttk.Label(meta_frame, text=label).grid(row=i, column=0, sticky='w', padx=5, pady=3)
            if "Camera" in label: ttk.Combobox(meta_frame, textvariable=var, values=CAMERAS, state="readonly").grid(row=i, column=1, sticky='we', padx=5, pady=3)
            elif "Telescope" in label: ttk.Combobox(meta_frame, textvariable=var, values=TELESCOPES, state="readonly").grid(row=i, column=1, sticky='we', padx=5, pady=3)
            else: ttk.Entry(meta_frame, textvariable=var).grid(row=i, column=1, sticky='we', padx=5, pady=3)
        ttk.Label(meta_frame, text="Notes:").grid(row=len(fields), column=0, sticky='nw', padx=5, pady=3)
        self.add_notes = scrolledtext.ScrolledText(meta_frame, height=4)
        self.add_notes.grid(row=len(fields), column=1, sticky='we', padx=5, pady=3)
        
        img_frame = ttk.LabelFrame(frame, text="Image Preview", padding="10")
        img_frame.pack(fill='x', expand=True, padx=10, pady=5)
        btn_frame = ttk.Frame(img_frame); btn_frame.pack(pady=5)
        ttk.Button(btn_frame, text="Select Image...", command=self.select_image).pack(side="left", padx=5)
        ttk.Button(btn_frame, text="Paste Path from Clipboard", command=self.paste_image).pack(side="left", padx=5)
        self.preview_canvas = tk.Canvas(img_frame, bg="gray20", height=PREVIEW_MAX_H)
        self.preview_canvas.pack(fill="x", expand=True, padx=5, pady=5)
        
        assign_frame = ttk.LabelFrame(frame, text="Assignments", padding="10")
        assign_frame.pack(fill='both', expand=True, padx=10, pady=5)
        assign_frame.columnconfigure(0, weight=1)
        assign_frame.rowconfigure(0, weight=1)
        assign_frame.columnconfigure(1, minsize=150)
        
        self.subject_chooser = MultiSelectSearchableList(assign_frame)
        self.subject_chooser.grid(row=0, column=0, sticky='nsew', padx=(0,10))
        
        gal_container = ttk.Frame(assign_frame)
        gal_container.grid(row=0, column=1, sticky='ns')
        ttk.Label(gal_container, text="Galleries").pack(anchor='w')
        self.add_gallery_vars = {}
        self.add_gallery_frame = ttk.Frame(gal_container)
        self.add_gallery_frame.pack(fill='x')
        
        ttk.Button(frame, text="Save Image & Mark Subjects...", command=self.save_image).pack(pady=20)

    def _populate_gallery_checkboxes(self):
        for w in self.add_gallery_frame.winfo_children():
            w.destroy()
        self.add_gallery_vars.clear()
        for gal in self.db.get_galleries():
            var = tk.BooleanVar()
            self.add_gallery_vars[gal['id']] = var
            ttk.Checkbutton(self.add_gallery_frame, text=gal['name'], variable=var).pack(anchor='w', padx=5)

    def select_image(self, path=None):
        p = path or filedialog.askopenfilename(filetypes=[("Image Files", "*.jpg;*.jpeg;*.png;*.tif;*.tiff")])
        if p:
            self.load_preview(Path(p))

    def paste_image(self):
        try:
            p = Path(self.clipboard_get().strip().strip('"'))
            if p.is_file():
                self.select_image(p)
            else:
                messagebox.showwarning("Paste Error", "Clipboard content is not a valid file path.")
        except tk.TclError:
            messagebox.showwarning("Paste Error", "Could not get path from clipboard.")

    def load_preview(self, path):
        self.source_image_path = path
        try:
            self.preview_canvas.update()
            width = self.preview_canvas.winfo_width()
            with Image.open(path) as img:
                img.thumbnail((width, PREVIEW_MAX_H), Image.Resampling.LANCZOS)
                self.preview_photo = ImageTk.PhotoImage(img)
            self.preview_canvas.delete("all")
            self.preview_canvas.create_image(self.preview_canvas.winfo_width()/2, self.preview_canvas.winfo_height()/2, image=self.preview_photo, anchor="center")
        except Exception as e:
            messagebox.showerror("Image Load Error", f"Failed to load image: {e}")
            self.source_image_path = None

    def build_tab_browse(self):
        frame = self.tab_browse
        cols = ("Label", "Date", "Integration", "Camera", "Telescope", "Galleries", "Subjects", "Bounding Boxes")
        self.tree = ttk.Treeview(frame, columns=cols, show="headings")
        for c in cols:
            self.tree.heading(c, text=c, command=lambda _c=c: self._treeview_sort_column(_c, False))
            self.tree.column(c, width=150, anchor='w')
        
        self.tree.column("Label", width=200)
        self.tree.column("Date", width=100, anchor='center')
        self.tree.column("Integration", width=80, anchor='center')
        self.tree.column("Galleries", width=200)
        self.tree.column("Subjects", width=300)
        self.tree.column("Bounding Boxes", width=300)
        
        vsb = ttk.Scrollbar(frame, orient="vertical", command=self.tree.yview)
        hsb = ttk.Scrollbar(frame, orient="horizontal", command=self.tree.xview)
        self.tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
        
        vsb.pack(side='right', fill='y')
        hsb.pack(side='bottom', fill='x')
        self.tree.pack(fill="both", expand=True, padx=5, pady=5)
        
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(pady=5)
        ttk.Button(btn_frame, text="Edit Selected", command=self.edit_selected).pack(side="left", padx=5)
        ttk.Button(btn_frame, text="Delete Selected", command=self.delete_selected).pack(side="left", padx=5)

    def _treeview_sort_column(self, col, reverse):
        """Sorts the treeview columns when a header is clicked."""
        try:
            items = [(float(self.tree.set(k, col)), k) for k in self.tree.get_children('') if self.tree.set(k, col)]
        except (ValueError, tk.TclError):
            items = [(self.tree.set(k, col).lower(), k) for k in self.tree.get_children('')]
        items.sort(reverse=reverse)
        for index, (val, k) in enumerate(items):
            self.tree.move(k, '', index)
        self.tree.heading(col, command=lambda: self._treeview_sort_column(col, not reverse))

    def refresh_tab_browse(self):
        for item in self.tree.get_children():
            self.tree.delete(item)
        
        all_galleries = self.db.get_galleries()
        galleries_map = {g['id']: g['name'] for g in all_galleries}
        
        for row in self.db.get_all_data_for_publishing():
            gallery_names = [galleries_map.get(gid) for gid in row['gallery_ids'] if gid in galleries_map]
            subject_names = [s['name'] for s in row['subjects']]
            bounding_boxes = [f"[{s['bounding_box']}]" for s in row['subjects'] if s['bounding_box'] and s['bounding_box'] != 'null']
            
            values = (
                row['label'], row['data']['date'], row['data']['integration'],
                row['data']['camera'], row['data']['telescope'],
                ', '.join(gallery_names), ', '.join(subject_names), ', '.join(bounding_boxes)
            )
            self.tree.insert("", "end", values=values, iid=row['id'])

    def delete_selected(self):
        if not self.tree.selection():
            return
        image_id = self.tree.selection()[0]
        item_values = self.tree.item(image_id, 'values')
        label = item_values[0] if item_values else "this image"
        if not messagebox.askyesno("Confirm Deletion", f"Are you sure you want to delete '{label}'?"):
            return
        self.db.delete_image(image_id)
        messagebox.showinfo("Deleted", f"'{label}' has been deleted.")
        self.refresh_all_tabs()

    def edit_selected(self):
        if not self.tree.selection():
            return
        image_id = self.tree.selection()[0]
        
        original_data = self.db.get_image_details(image_id)

        edit_window = EditImageWindow(self, image_id)
        self.wait_window(edit_window)

        if not hasattr(edit_window, 'confirmed_edits') or not edit_window.confirmed_edits:
            return # User cancelled

        try:
            confirmed_data = edit_window.confirmed_edits
            marker_results = edit_window.new_marker_data if hasattr(edit_window, 'new_marker_data') else None

            # 1. Update the basic image metadata first
            self.db.update_image_data(image_id, confirmed_data)

            # 2. If new markings were made, process and save them
            if marker_results:
                # Delete all old thumbnails for this image
                old_thumb_paths = self.db.get_old_thumb_paths(image_id)
                for rel_path in old_thumb_paths:
                    (BASE_DIR / rel_path).unlink(missing_ok=True)
                
                # Process the new markings
                processed_subject_data = {}
                full_image_path = BASE_DIR / original_data['file_path']
                with Image.open(full_image_path) as img:
                    for subject_id, data in marker_results.items():
                        bbox_str = None
                        if data.get('bbox_coords'):
                            bbox_list = data['bbox_coords']
                            bbox_str = ','.join(map(str, [c for p in bbox_list for c in p]))

                        thumb_path_str = None
                        if data.get('thumb_coords'):
                            box_4_points = data['thumb_coords']
                            min_x = min(p[0] for p in box_4_points)
                            min_y = min(p[1] for p in box_4_points)
                            max_x = max(p[0] for p in box_4_points)
                            max_y = max(p[1] for p in box_4_points)
                            
                            thumb_path = THUMB_DIR / f"{image_id}_{subject_id}.jpg"
                            cropped = img.crop((min_x, min_y, max_x, max_y))
                            cropped.thumbnail(THUMB_SIZE)
                            if cropped.mode in ("RGBA", "P"):
                                cropped = cropped.convert("RGB")
                            cropped.save(thumb_path, "JPEG", quality=90)
                            thumb_path_str = str(thumb_path.relative_to(BASE_DIR).as_posix())
                        
                        processed_subject_data[subject_id] = {'box': bbox_str, 'thumb_path': thumb_path_str}

                # 3. Replace all subject associations with the newly processed data
                self.db.replace_subject_associations(image_id, processed_subject_data)
            
            messagebox.showinfo("Success", "Image has been successfully updated.")

        except Exception as e:
            self.show_error(None, traceback.format_exc(), None)
        finally:
            self.refresh_all_tabs()

    def _build_manager_tab(self, parent, name, add_cb, del_all_cb, del_one_cb, import_cb=None):
        frame = parent.inner
        header = ttk.Frame(frame)
        header.pack(fill="x", padx=10, pady=5)
        
        ttk.Label(header, text=f"New {name}:").pack(side="left")
        entry_var = tk.StringVar()
        entry = ttk.Entry(header, textvariable=entry_var)
        entry.pack(side="left", padx=5, fill='x', expand=True)
        
        def add_action():
            val = entry_var.get().strip()
            if val:
                add_cb(val)
                entry_var.set("")
        
        entry.bind("<Return>", lambda event: add_action())
        ttk.Button(header, text="Add", command=add_action).pack(side="left", padx=5)
        
        btn_bar = ttk.Frame(frame)
        btn_bar.pack(fill='x', padx=10, pady=5)
        
        if import_cb:
            ttk.Button(btn_bar, text=f"Import Messier Objects", command=import_cb).pack(side="left", padx=5)
        ttk.Button(btn_bar, text=f"Delete All {name}s", command=del_all_cb).pack(side="right", padx=5)

        list_frame = ttk.Frame(frame)
        list_frame.pack(fill="both", expand=True, padx=10, pady=5)
        return list_frame

    def build_tab_subjects(self):
        self.subj_list_frame = self._build_manager_tab(self.tab_manage_subjects, "Subject", self.add_subject, self.delete_all_subjects, self.del_subject, self.import_messier)

    def refresh_subjects_tab(self):
        for w in self.subj_list_frame.winfo_children(): w.destroy()
        for s in self.db.get_subjects():
            r=ttk.Frame(self.subj_list_frame);r.pack(fill="x",pady=2);ttk.Label(r,text=s['name']).pack(side="left",expand=True,fill="x",padx=5);ttk.Button(r,text="Delete",command=lambda i=s['id']:self.del_subject(i)).pack(side="right")

    def add_subject(self, n):
        if n: self.db.add_subject(n); self.refresh_all_tabs()

    def del_subject(self, i):
        if messagebox.askyesno("Delete Subject", "Delete this subject and all image associations?"): self.db.delete_item("subjects", i); self.refresh_all_tabs()

    def delete_all_subjects(self):
        if messagebox.askyesno("DELETE ALL SUBJECTS", "Are you sure?"): self.db.delete_all("subjects"); self.refresh_all_tabs()

    def import_messier(self):
        M = [(1,"Crab Nebula"),(2,""),(3,""),(4,""),(5,""),(6,"Butterfly Cluster"),(7,"Ptolemy Cluster"),(8,"Lagoon Nebula"),(9,""),(10,""),(11,"Wild Duck Cluster"),(12,""),(13,"Hercules Globular Cluster"),(14,""),(15,"Great Pegasus Cluster"),(16,"Eagle Nebula"),(17,"Omega Nebula"),(18,""),(19,""),(20,"Trifid Nebula"),(21,"Webb's Cross"),(22,"Sagittarius Cluster"),(23,""),(24,"Sagittarius Star Cloud"),(25,""),(26,""),(27,"Dumbbell Nebula"),(28,""),(29,"Cooling Tower Cluster"),(30,""),(31,"Andromeda Galaxy"),(32,"Le Gentil"),(33,"Triangulum Galaxy"),(34,""),(35,""),(36,"Pinwheel Cluster"),(37,"January Salt-and-Pepper Cluster"),(38,"Starfish Cluster"),(39,""),(40,""),(41,""),(42,"Orion Nebula"),(43,"De Mairan’s Nebula"),(44,"Beehive Cluster"),(45,"Pleiades"),(46,""),(47,""),(48,""),(49,""),(50,"Heart-Shaped Cluster"),(51,"Whirlpool Galaxy"),(52,""),(53,""),(54,""),(55,""),(56,""),(57,"Ring Nebula"),(58,""),(59,""),(60,""),(61,""),(62,""),(63,"Sunflower Galaxy"),(64,"Black Eye Galaxy"),(65,""),(66,""),(67,""),(68,""),(69,""),(70,""),(71,""),(72,""),(73,""),(74,"Phantom Galaxy"),(75,""),(76,"Little Dumbbell Nebula"),(77,"Cetus A"),(78,""),(79,""),(80,""),(81,"Bode's Galaxy"),(82,"Cigar Galaxy"),(83,"Southern Pinwheel Galaxy"),(84,""),(85,""),(86,""),(87,"Virgo A"),(88,""),(89,""),(90,""),(91,""),(92,"Hercules Cluster"),(93,""),(94,""),(95,""),(96,""),(97,"Owl Nebula"),(98,""),(99,"Coma Pinwheel Galaxy"),(100,""),(101,"Pinwheel Galaxy"),(102,"Spindle Galaxy"),(103,""),(104,"Sombrero Galaxy"),(105,""),(106,""),(107,""),(108,"Surfboard Galaxy"),(109,""),(110,"")]
        if messagebox.askyesno("Import", "Import 110 Messier objects as subjects?"):
            for num,name in M: self.db.add_subject(f"M{num}" + (f" - {name}" if name else ""))
            self.refresh_all_tabs(); messagebox.showinfo("Import Complete", "Messier subjects added.")

    def build_tab_galleries(self): self.gal_list_frame = self._build_manager_tab(self.tab_manage_galleries, "Gallery", self.add_gallery, self.delete_all_galleries, self.del_gallery)

    def refresh_galleries_tab(self):
        for w in self.gal_list_frame.winfo_children(): w.destroy()
        for g in self.db.get_galleries():
            r=ttk.Frame(self.gal_list_frame); r.pack(fill="x",pady=2); ttk.Label(r,text=g['name']).pack(side="left",expand=True,fill="x",padx=5); ttk.Button(r,text="Delete",command=lambda i=g['id']: self.del_gallery(i)).pack(side="right")

    def add_gallery(self, n):
        if n: self.db.add_gallery(n); self.refresh_all_tabs()

    def del_gallery(self, i):
        if messagebox.askyesno("Delete Gallery", "Delete this gallery and all image associations?"): self.db.delete_item("galleries", i); self.refresh_all_tabs()

    def delete_all_galleries(self):
        if messagebox.askyesno("DELETE ALL GALLERIES", "Are you sure?"): self.db.delete_all("galleries"); self.refresh_all_tabs()
        
    def save_image(self):
        if not self.source_image_path: return messagebox.showerror("Error", "Select an image.")
        selected_ids = self.subject_chooser.get_selection()
        if not selected_ids: return messagebox.showerror("Error", "Assign at least one subject.")
        
        all_subjects = self.db.get_subjects()
        subjects_to_mark = [s for s in all_subjects if s['id'] in selected_ids]
        
        marker_window = SubjectMarkerWindow(self, self.source_image_path, subjects_to_mark)
        self.wait_window(marker_window)
        marker_results = marker_window.results
        if marker_results is None:
            messagebox.showinfo("Cancelled", "Image save process cancelled.")
            return

        img_id = str(uuid.uuid4()); dest = ORIG_DIR/(img_id + self.source_image_path.suffix); shutil.copy(self.source_image_path, dest)
        
        subject_data = {}
        with Image.open(self.source_image_path) as img:
            image_dims = img.size
            for subject_id in selected_ids:
                data = marker_results.get(subject_id, {})
                thumb_path_str = None
                bbox_str = data.get('bbox_coords')
                if isinstance(bbox_str, list): # Check if it's a list of coords
                    bbox_str = ','.join(map(str, [c for p in bbox_str for c in p]))
                
                if data.get('thumb_coords'):
                    box_4_points = data['thumb_coords']
                    min_x = min(p[0] for p in box_4_points); min_y = min(p[1] for p in box_4_points)
                    max_x = max(p[0] for p in box_4_points); max_y = max(p[1] for p in box_4_points)
                    thumb_path = THUMB_DIR / f"{img_id}_{subject_id}.jpg"
                    cropped = img.crop((min_x, min_y, max_x, max_y)); cropped.thumbnail(THUMB_SIZE)
                    if cropped.mode in ("RGBA", "P"): cropped = cropped.convert("RGB")
                    cropped.save(thumb_path, "JPEG", quality=90)
                    thumb_path_str = str(thumb_path.relative_to(BASE_DIR).as_posix())
                
                subject_data[subject_id] = {'box': bbox_str, 'thumb_path': thumb_path_str}

        integration_val = int(self.add_integration.get()) if self.add_integration.get() else None
        image_data = {'id':img_id, 'label':self.add_label.get().strip(), 'file_path':str(dest.relative_to(BASE_DIR).as_posix()), 'date':self.add_date.get().strip(), 'integration':integration_val, 'camera':self.add_camera.get().strip(), 'telescope':self.add_telescope.get().strip(), 'notes':self.add_notes.get("1.0","end").strip(), 'width': image_dims[0], 'height': image_dims[1]}
        gallery_ids = [gid for gid, var in self.add_gallery_vars.items() if var.get()]
        
        self.db.save_image_data(image_data, subject_data, gallery_ids)
        messagebox.showinfo("Success", "Image has been saved.")
        self.clear_add_form()
        self.refresh_all_tabs()

    def publish_json(self):
        if not messagebox.askyesno("Publish Website Data", "This will overwrite the JSON data files for your website. Are you sure?"): return
        all_images_data = self.db.get_all_data_for_publishing(); galleries_data = self.db.get_galleries()
        with open(DATA_DIR / "all_images.json", "w") as f: json.dump(all_images_data, f, indent=2)
        galleries_map = {g['name']: g['id'] for g in galleries_data};
        with open(DATA_DIR / "galleries.json", "w") as f: json.dump(galleries_map, f, indent=2)
        messagebox.showinfo("Publish Complete", f"Successfully published data for {len(all_images_data)} images to all_images.json.")

    def clear_add_form(self):
        self.add_label.set(""); self.add_date.set(""); self.add_integration.set("")
        self.add_camera.set(""); self.add_telescope.set(""); self.add_notes.delete("1.0", "end")
        self.preview_canvas.delete("all"); self.source_image_path=None; self.preview_photo=None
        self.subject_chooser.deselect_all()
        for var in self.add_gallery_vars.values(): var.set(False)

    def refresh_all_tabs(self):
        all_subjects = self.db.get_subjects()
        # The Add tab chooser is always present
        if hasattr(self, 'subject_chooser'):
            self.subject_chooser.populate_items(all_subjects)
        
        self._populate_gallery_checkboxes()
        self.refresh_tab_browse()
        self.refresh_subjects_tab()
        self.refresh_galleries_tab()

def main():
    """Initializes and runs the main application."""
    app = App()
    app.mainloop()

if __name__ == "__main__":
    main()