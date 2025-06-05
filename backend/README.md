# Messier Uploader

This small Express service lets you upload a Messier object photo and automatically:

1. Saves the original image into `photos/messier/`.
2. Generates a smaller thumbnail in `photos/messier/thumbs/` using `sharp`.
3. Inserts a grid entry into `messier.html` with the provided styling.
4. Commits the changes and pushes them to `main` using `simple-git`.

## Usage

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) to upload new images.

Make sure this repo has write access and you are on the `main` branch with a clean working tree before running the service.
