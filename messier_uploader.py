import tkinter as tk
from tkinter import filedialog, messagebox
try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    DND_AVAILABLE = True
except ImportError:  # Fallback when tkinterdnd2 is not installed
    TkinterDnD = None
    DND_AVAILABLE = False
from PIL import Image, ImageTk
from pathlib import Path
import re
import shutil

THUMB_SIZE = 400
DISPLAY_SIZE = 800  # Maximum width or height for preview

class CropSelector:
    def __init__(self, canvas, photo_scale):
        self.canvas = canvas
        self.scale = photo_scale
        self.rect = None
        self.start_x = None
        self.start_y = None
        self.coords = None
        canvas.bind('<ButtonPress-1>', self.on_press)
        canvas.bind('<B1-Motion>', self.on_drag)
        canvas.bind('<ButtonRelease-1>', self.on_release)

    def on_press(self, event):
        self.start_x, self.start_y = event.x, event.y
        if self.rect:
            self.canvas.delete(self.rect)
        self.rect = self.canvas.create_rectangle(self.start_x, self.start_y,
                                                 self.start_x, self.start_y,
                                                 outline='red')

    def on_drag(self, event):
        dx = event.x - self.start_x
        dy = event.y - self.start_y
        size = max(abs(dx), abs(dy))
        end_x = self.start_x + (size if dx >= 0 else -size)
        end_y = self.start_y + (size if dy >= 0 else -size)
        self.canvas.coords(self.rect, self.start_x, self.start_y, end_x, end_y)

    def on_release(self, event):
        if self.rect:
            self.coords = [int(c * self.scale) for c in self.canvas.coords(self.rect)]

    def get_crop_box(self):
        if not self.coords:
            return None
        x1, y1, x2, y2 = self.coords
        if x2 < x1:
            x1, x2 = x2, x1
        if y2 < y1:
            y1, y2 = y2, y1
        return (x1, y1, x2, y2)

def update_html(number, label, file_name):
    html_path = Path('messier.html')
    html = html_path.read_text()

    label_regex = re.compile(r"openModal\('(M{}[^']*)'\)".format(number))
    match = label_regex.search(html)
    old_label = match.group(1) if match else f"M{number}"

    entry = (
        f'<div class="grid-item photographed" onclick="openModal(\'{label}\')" '
        f'data-full="/photos/messier/{file_name}" '
        f'style="background-image: url(\'/photos/messier/thumbs/{file_name}\');"></div>'
    )

    phot_reg = re.compile(
        r'<div class="grid-item photographed"[^>]*openModal\\(\'%s\'\\)[^>]*>.*?</div>' % re.escape(old_label),
        re.S,
    )
    plain_reg = re.compile(
        r"<div class=\"grid-item\"[^>]*openModal\('M{}'\)>M{}<\/div>".format(number, number)
    )

    if phot_reg.search(html):
        html = phot_reg.sub(entry, html)
    elif plain_reg.search(html):
        html = plain_reg.sub(entry, html)
    else:
        raise ValueError(f'Could not find grid item for M{number}')

    html_path.write_text(html)

base_class = TkinterDnD.Tk if DND_AVAILABLE else tk.Tk


class App(base_class):
    def __init__(self):
        super().__init__()
        self.title('Messier Uploader')

        if DND_AVAILABLE:
            self.drop_target_register(DND_FILES)
            self.dnd_bind('<<Drop>>', self.on_drop)

        self.number_var = tk.IntVar(value=1)
        self.name_var = tk.StringVar()
        self.image_path = None
        self.image = None
        self.photo = None
        self.cropper = None

        controls = tk.Frame(self)
        controls.pack(pady=5)

        tk.Label(controls, text='Messier Number (1-110)').grid(row=0, column=0, sticky='w')
        tk.Spinbox(controls, from_=1, to=110, textvariable=self.number_var, width=5).grid(row=0, column=1, sticky='w')
        tk.Label(controls, text='Name (optional)').grid(row=1, column=0, sticky='w')
        tk.Entry(controls, textvariable=self.name_var).grid(row=1, column=1, sticky='w')
        tk.Button(controls, text='Select Image', command=self.select_image).grid(row=2, column=0, columnspan=2, pady=5)

        self.canvas = tk.Canvas(self, width=DISPLAY_SIZE, height=DISPLAY_SIZE)
        self.canvas.pack()

        tk.Button(self, text='Add to Gallery', command=self.save).pack(pady=10)

    def select_image(self):
        path = filedialog.askopenfilename(filetypes=[('JPEG images', '*.jpg *.jpeg')])
        if path:
            self.load_image(path)

    def load_image(self, path):
        self.image_path = path
        self.image = Image.open(path)
        w, h = self.image.size
        scale = max(w, h) / DISPLAY_SIZE
        if scale < 1:
            scale = 1
        disp_w, disp_h = int(w / scale), int(h / scale)
        display_img = self.image.resize((disp_w, disp_h), Image.LANCZOS) if scale != 1 else self.image
        self.photo = ImageTk.PhotoImage(display_img)
        self.canvas.config(width=disp_w, height=disp_h)
        self.canvas.delete('all')
        self.canvas.create_image(0, 0, image=self.photo, anchor='nw')
        self.cropper = CropSelector(self.canvas, scale)

    def on_drop(self, event):
        files = self.tk.splitlist(event.data)
        if files:
            self.load_image(files[0])

    def save(self):
        if not self.image_path or not self.cropper:
            messagebox.showerror('Error', 'Select an image first.')
            return
        box = self.cropper.get_crop_box()
        if not box:
            messagebox.showerror('Error', 'Select a crop area.')
            return
        number = self.number_var.get()
        if not 1 <= number <= 110:
            messagebox.showerror('Error', 'Number must be between 1 and 110.')
            return
        name = self.name_var.get().strip()
        label = f"M{number}" + (f" - {name}" if name else '')
        file_name = f"{number}.jpg"

        full_path = Path('photos/messier') / file_name
        thumb_path = Path('photos/messier/thumbs') / file_name
        full_path.parent.mkdir(parents=True, exist_ok=True)
        thumb_path.parent.mkdir(parents=True, exist_ok=True)

        shutil.copy(self.image_path, full_path)
        cropped = self.image.crop(box)
        thumb = cropped.resize((THUMB_SIZE, THUMB_SIZE), Image.LANCZOS)
        thumb.save(thumb_path)

        try:
            update_html(number, label, file_name)
            messagebox.showinfo('Success', f'Added {label}')
        except Exception as e:
            messagebox.showerror('Error', str(e))

if __name__ == '__main__':
    app = App()
    app.mainloop()
