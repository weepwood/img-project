import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const distDir = path.join(projectRoot, 'dist');
const sourceImagesDir = path.join(projectRoot, 'imgs');
const sourceFiles = ['index.html', 'styles.css', 'app.js', 'code.html'];
const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg']);
const rasterExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp']);

const thumbWidth = numberFromEnv('THUMB_WIDTH', 520);
const thumbQuality = numberFromEnv('THUMB_QUALITY', 72);
const previewWidth = numberFromEnv('PREVIEW_WIDTH', 2048);
const previewQuality = numberFromEnv('PREVIEW_QUALITY', 82);
const transformConcurrency = numberFromEnv('IMAGE_CONCURRENCY', 4);
const copyOriginals = process.env.COPY_ORIGINALS !== 'false';
const originalBaseUrl = (process.env.ORIGINAL_BASE_URL || '').replace(/\/+$/, '');

function numberFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureCleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function copyDir(source, target) {
  if (!(await pathExists(source))) return;

  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

async function ensureDirFor(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function getAlbum(relativeFromImgs) {
  return relativeFromImgs.includes('/') ? relativeFromImgs.split('/')[0] : 'root';
}

function isRaster(ext) {
  return rasterExts.has(ext);
}

function variantRelativePath(relativeFromImgs, ext) {
  if (!isRaster(ext)) return relativeFromImgs;
  const parsed = path.posix.parse(relativeFromImgs);
  return path.posix.join(parsed.dir, `${parsed.name}.webp`);
}

function encodeUrlPath(relativePath) {
  return relativePath.split('/').map(encodeURIComponent).join('/');
}

function originalUrl(relativeFromImgs) {
  if (originalBaseUrl) {
    return `${originalBaseUrl}/${encodeUrlPath(relativeFromImgs)}`;
  }
  return `./imgs/${encodeUrlPath(relativeFromImgs)}`;
}

async function createVariant(sourcePath, destPath, { width, quality }) {
  await ensureDirFor(destPath);
  const ext = path.extname(sourcePath).toLowerCase();

  if (ext === '.svg') {
    await fs.copyFile(sourcePath, destPath);
    const [stat, metadata] = await Promise.all([
      fs.stat(destPath),
      sharp(sourcePath).metadata(),
    ]);
    return {
      size: stat.size,
      width: metadata.width || null,
      height: metadata.height || null,
      format: 'svg',
    };
  }

  const info = await sharp(sourcePath, { animated: false })
    .rotate()
    .resize({
      width,
      height: width,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4, smartSubsample: true })
    .toFile(destPath);

  return {
    size: info.size,
    width: info.width,
    height: info.height,
    format: info.format,
  };
}

async function scanImages(rootDir) {
  const results = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!imageExts.has(ext)) continue;

      const relativeFromImgs = path.relative(rootDir, fullPath).split(path.sep).join('/');
      const publicPath = `imgs/${relativeFromImgs}`;
      const thumbPath = `thumbs/${variantRelativePath(relativeFromImgs, ext)}`;
      const previewPath = `previews/${variantRelativePath(relativeFromImgs, ext)}`;
      const [meta, stat] = await Promise.all([
        sharp(fullPath, { animated: false }).metadata(),
        fs.stat(fullPath),
      ]);

      results.push({
        name: entry.name,
        album: getAlbum(relativeFromImgs),
        path: publicPath,
        originalSrc: originalUrl(relativeFromImgs),
        thumbSrc: `./${thumbPath}`,
        previewSrc: `./${previewPath}`,
        size: stat.size,
        width: meta.width || null,
        height: meta.height || null,
        format: ext.slice(1),
        thumbExt: isRaster(ext) ? '.webp' : ext,
        previewExt: isRaster(ext) ? '.webp' : ext,
      });
    }
  }

  if (await pathExists(rootDir)) await walk(rootDir);

  results.sort((a, b) => {
    const albumCompare = a.album.localeCompare(b.album);
    return albumCompare || a.name.localeCompare(b.name);
  });

  return results;
}

async function runWithConcurrency(items, limit, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function buildVariants(images) {
  await runWithConcurrency(images, transformConcurrency, async (image) => {
    const sourcePath = path.join(projectRoot, image.path);
    const thumbPath = path.join(distDir, image.thumbSrc.replace(/^\.\//, ''));
    const previewPath = path.join(distDir, image.previewSrc.replace(/^\.\//, ''));

    const [thumbInfo, previewInfo] = await Promise.all([
      createVariant(sourcePath, thumbPath, { width: thumbWidth, quality: thumbQuality }),
      createVariant(sourcePath, previewPath, { width: previewWidth, quality: previewQuality }),
    ]);

    image.thumbSize = thumbInfo.size;
    image.thumbWidth = thumbInfo.width;
    image.thumbHeight = thumbInfo.height;
    image.previewSize = previewInfo.size;
    image.previewWidth = previewInfo.width;
    image.previewHeight = previewInfo.height;
  });
}

function publicImage(image) {
  const { thumbExt, previewExt, ...manifestImage } = image;
  return manifestImage;
}

async function build() {
  await ensureCleanDir(distDir);

  const images = await scanImages(sourceImagesDir);
  await buildVariants(images);

  for (const file of sourceFiles) {
    const sourcePath = path.join(projectRoot, file);
    if (await pathExists(sourcePath)) {
      await fs.copyFile(sourcePath, path.join(distDir, file));
    }
  }

  if (copyOriginals) {
    await copyDir(sourceImagesDir, path.join(distDir, 'imgs'));
  }

  await fs.writeFile(
    path.join(distDir, 'images.json'),
    `${JSON.stringify(images.map(publicImage), null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(path.join(distDir, '.nojekyll'), '', 'utf8');

  console.log(
    `Built ${images.length} image${images.length === 1 ? '' : 's'} ` +
    `with ${thumbWidth}px thumbnails and ${previewWidth}px web previews.`,
  );
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
