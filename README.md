# imgs-gallery

Static image gallery for GitHub Pages with a three-level image pipeline:

- **Thumbnail**: 520px WebP for the gallery grid.
- **Web preview**: 2048px WebP for the inspector and large viewer.
- **Original**: retained for explicit download only.

## How it works

- Put images inside `imgs/` and any nested folders you want.
- The build scans `imgs/` recursively and writes `dist/images.json`.
- Raster images generate compressed files in `dist/thumbs/` and `dist/previews/`.
- The gallery immediately shows a thumbnail, then progressively replaces it with the web preview.
- The large viewer supports previous/next navigation, keyboard shortcuts, and adjacent-image preloading.
- GitHub Actions publishes `dist/` to GitHub Pages on every push to `main`.

The Pages workflow does not copy original images into the deployment artifact. Original download links point to the exact Git commit on `raw.githubusercontent.com`, reducing Pages artifact size and deployment time.

## Folder convention

- `imgs/root-image.jpg` becomes part of the `root` album.
- `imgs/unsplash-img/screen.png` becomes the `unsplash-img` album.
- `imgs/up-img/photo.jpg` becomes the `up-img` album.

## Local build

```bash
npm ci
npm run build
```

Local builds copy original images to `dist/imgs/` by default, so all links work with any static server.

## Build options

The image pipeline can be adjusted with environment variables:

| Variable | Default | Description |
| --- | ---: | --- |
| `THUMB_WIDTH` | `520` | Maximum thumbnail width and height |
| `THUMB_QUALITY` | `72` | Thumbnail WebP quality |
| `PREVIEW_WIDTH` | `2048` | Maximum web-preview width and height |
| `PREVIEW_QUALITY` | `82` | Web-preview WebP quality |
| `IMAGE_CONCURRENCY` | `4` | Number of images transformed concurrently |
| `COPY_ORIGINALS` | `true` | Copy originals into `dist/imgs/` |
| `ORIGINAL_BASE_URL` | empty | Base URL used for original-file links |

Example production-style build:

```bash
COPY_ORIGINALS=false \
ORIGINAL_BASE_URL=https://raw.githubusercontent.com/OWNER/REPO/COMMIT/imgs \
npm run build
```

## GitHub Pages

1. In repository settings, set Pages source to **GitHub Actions**.
2. Push image or code changes to `main`.
3. The workflow installs dependencies, generates image variants, and deploys the site.
