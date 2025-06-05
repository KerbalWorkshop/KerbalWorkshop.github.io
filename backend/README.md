# Messier Uploader

This small Express service lets you upload a Messier object photo and automatically:

1. Saves the original image into `photos/messier/`.
2. Generates a smaller thumbnail in `photos/messier/thumbs/` using `sharp`.
3. Inserts a grid entry into `messier.html` just before the `<!-- MESSIER_ITEMS -->` placeholder.
4. Commits the changes and pushes them to `main` using `simple-git`.

## Usage

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) to upload new images.

Make sure this repo has write access and you are on the `main` branch with a clean working tree before running the service.

The `messier.html` file must include a `<!-- MESSIER_ITEMS -->` comment inside the Messier grid. New entries will be inserted immediately before this placeholder every time you upload a photo.

This comment marks where the next thumbnail will be added. The uploader replaces
the `<!-- MESSIER_ITEMS -->` token with the new grid item and reinserts the
placeholder so subsequent uploads keep working.
