const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const simpleGit = require('simple-git');

// Placeholder used to mark insertion point in messier.html
const PLACEHOLDER = '<!-- MESSIER_ITEMS -->';

// Ensure required directories exist
fs.mkdirSync('uploads', { recursive: true });
fs.mkdirSync(path.join(__dirname, '..', 'photos', 'messier', 'thumbs'), { recursive: true });

const upload = multer({ dest: 'uploads/' });
const app = express();
const git = simpleGit();

app.use(express.static('public'));
app.use(express.json());

app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const { label, thumbSize = 400, backgroundSize, backgroundPosition } = req.body;
    const file = req.file;
    if (!file) throw new Error('No file uploaded');

    const fileName = file.originalname;
    const destFull = path.join(__dirname, '..', 'photos', 'messier', fileName);
    const destThumb = path.join(__dirname, '..', 'photos', 'messier', 'thumbs', fileName);

    // move full image
    fs.renameSync(file.path, destFull);
    // generate thumbnail
    await sharp(destFull).resize({ width: parseInt(thumbSize) }).toFile(destThumb);

    // update HTML
    const htmlPath = path.join(__dirname, '..', 'messier.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    const entry = `<div class="grid-item photographed" onclick="openModal('${label}')" data-full="/photos/messier/${fileName}" style="background-image: url('/photos/messier/thumbs/${fileName}'); background-size: ${backgroundSize}; background-position: ${backgroundPosition};"></div>`;
    html = html.replace(PLACEHOLDER, entry + '\n          ' + PLACEHOLDER);
    fs.writeFileSync(htmlPath, html);

    await git.add(['photos/messier/' + fileName, 'photos/messier/thumbs/' + fileName, 'messier.html']);
    await git.commit(`Add ${label}`);
    await git.push();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Uploader running on http://localhost:3000'));
