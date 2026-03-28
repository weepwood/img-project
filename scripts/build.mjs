import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const distDir = path.join(projectRoot, 'dist');
const sourceImagesDir = path.join(projectRoot, 'imgs');
const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg']);
const sourceFiles = ['index.html', 'styles.css', 'app.js', 'code.html'];

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
  if (!(await pathExists(source))) {
    return;
  }

  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
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

      if (!entry.isFile()) {
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!imageExts.has(ext)) {
        continue;
      }

      const stat = await fs.stat(fullPath);
      const relativeFromImgs = path.relative(rootDir, fullPath).split(path.sep).join('/');
      const publicPath = `imgs/${relativeFromImgs}`;
      const album = relativeFromImgs.includes('/')
        ? relativeFromImgs.split('/')[0]
        : 'root';

      results.push({
        name: entry.name,
        album,
        path: publicPath,
        src: `./${publicPath}`,
        size: stat.size,
      });
    }
  }

  if (await pathExists(rootDir)) {
    await walk(rootDir);
  }

  results.sort((a, b) => {
    const albumCompare = a.album.localeCompare(b.album);
    if (albumCompare !== 0) return albumCompare;
    return a.name.localeCompare(b.name);
  });

  return results;
}

async function build() {
  await ensureCleanDir(distDir);

  const images = await scanImages(sourceImagesDir);
  await fs.writeFile(path.join(distDir, 'images.json'), `${JSON.stringify(images, null, 2)}\n`, 'utf8');

  for (const file of sourceFiles) {
    const sourcePath = path.join(projectRoot, file);
    if (await pathExists(sourcePath)) {
      await fs.copyFile(sourcePath, path.join(distDir, file));
    }
  }

  await copyDir(sourceImagesDir, path.join(distDir, 'imgs'));
  await fs.writeFile(path.join(distDir, '.nojekyll'), '', 'utf8');

  console.log(`Built ${images.length} image${images.length === 1 ? '' : 's'} into dist/`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
