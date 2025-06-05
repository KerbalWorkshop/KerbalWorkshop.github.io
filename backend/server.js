const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const simpleGit = require('simple-git');

// Ensure required directories exist
fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(__dirname, '..', 'photos', 'messier', 'thumbs'), { recursive: true });

const upload = multer({ dest: 'uploads/' });
const app = express();
const git = simpleGit();

app.use(express.static('public'));
app.use(express.json());

const THUMB_SIZE = 400;

app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const { number, backgroundSize, backgroundPosition } = req.body;
    const file = req.file;
    if (!file) throw new Error('No file uploaded');

    const ext = path.extname(file.originalname) || '.jpg';
    const fileName = `${number}${ext}`;
    const destFull = path.join(__dirname, '..', 'photos', 'messier', fileName);
    const destThumb = path.join(__dirname, '..', 'photos', 'messier', 'thumbs', fileName);

    // move full image
    fs.renameSync(file.path, destFull);
    // generate thumbnail
    await sharp(destFull).resize({ width: THUMB_SIZE }).toFile(destThumb);

    // update HTML
    const htmlPath = path.join(__dirname, '..', 'messier.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    const labelRegex = new RegExp(`openModal\\('(M${number}[^']*)'\\)`);
    const labelMatch = html.match(labelRegex);
    const label = labelMatch ? labelMatch[1] : `M${number}`;

    const entry = `<div class="grid-item photographed" onclick="openModal('${label}')" data-full="/photos/messier/${fileName}" style="background-image: url('/photos/messier/thumbs/${fileName}'); background-size: ${backgroundSize}; background-position: ${backgroundPosition};"></div>`;

    const photReg = new RegExp(`<div class="grid-item photographed"[^>]*openModal\\('${label.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}'\\)[^>]*>.*?<\\/div>`, 's');
    const plainReg = new RegExp(`<div class="grid-item"[^>]*openModal\\('M${number}'\\)>M${number}<\\/div>`);

    if (photReg.test(html)) {
      html = html.replace(photReg, entry);
    } else if (plainReg.test(html)) {
      html = html.replace(plainReg, entry);
    } else {
      throw new Error(`Could not find grid item for M${number}`);
    }

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
