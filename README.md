# imgs-gallery

Static image gallery for GitHub Pages.

## How it works

- Put images inside `imgs/` and any nested folders you want.
- The build step scans `imgs/` recursively, creates compressed thumbnails in `dist/thumbs/`, and writes `dist/images.json`.
- The gallery loads thumbnails by default for faster page rendering, while the original file stays available through the "Open original" link.
- GitHub Actions publishes the `dist/` folder to GitHub Pages on every push to `main`.

## Folder convention

- `imgs/root-image.jpg` becomes part of the `root` album.
- `imgs/unsplash-img/screen.png` becomes the `unsplash-img` album.
- `imgs/up-img/photo.jpg` becomes the `up-img` album.

## Local build

```bash
npm run build
```

Serve the generated `dist/` folder with any static server.

## GitHub Pages

1. Push this repository to GitHub.
2. In repository settings, set Pages source to **GitHub Actions**.
3. Push new files into `imgs/` and the gallery will update after the workflow finishes.
