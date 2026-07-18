const IMAGE_ROOT = './imgs';
const MANIFEST_URL = './images.json';

const state = {
  allImages: [],
  activeAlbum: 'all',
  search: '',
  activeIndex: 0,
  activeTab: 'details',
  viewMode: 'grid',
  activeItem: null,
  paletteCache: new Map(),
  previewCache: new Set(),
  inspectorRequestId: 0,
  viewerList: [],
  viewerIndex: 0,
  viewerRequestId: 0,
};

const elements = {
  albumList: document.getElementById('albumList'),
  searchInput: document.getElementById('searchInput'),
  gallery: document.getElementById('gallery'),
  emptyState: document.getElementById('emptyState'),
  galleryHint: document.getElementById('galleryHint'),
  previewButton: document.getElementById('previewButton'),
  previewImage: document.getElementById('previewImage'),
  previewStatus: document.getElementById('previewStatus'),
  metaFile: document.getElementById('metaFile'),
  metaFolder: document.getElementById('metaFolder'),
  metaDimensions: document.getElementById('metaDimensions'),
  metaSize: document.getElementById('metaSize'),
  metaPreviewSize: document.getElementById('metaPreviewSize'),
  viewLargeButton: document.getElementById('viewLargeButton'),
  openLink: document.getElementById('openLink'),
  viewButtons: Array.from(document.querySelectorAll('.view-button')),
  tabButtons: Array.from(document.querySelectorAll('.tab[data-tab]')),
  detailsPanel: document.getElementById('detailsPanel'),
  contentPanel: document.getElementById('contentPanel'),
  colorsPanel: document.getElementById('colorsPanel'),
  contentSummary: document.getElementById('contentSummary'),
  contentAlbum: document.getElementById('contentAlbum'),
  contentPath: document.getElementById('contentPath'),
  contentExt: document.getElementById('contentExt'),
  contentView: document.getElementById('contentView'),
  colorSummary: document.getElementById('colorSummary'),
  colorPalette: document.getElementById('colorPalette'),
  lightbox: document.getElementById('lightbox'),
  viewerImage: document.getElementById('viewerImage'),
  viewerTitle: document.getElementById('viewerTitle'),
  viewerMeta: document.getElementById('viewerMeta'),
  viewerStatus: document.getElementById('viewerStatus'),
  viewerClose: document.getElementById('viewerClose'),
  viewerPrevious: document.getElementById('viewerPrevious'),
  viewerNext: document.getElementById('viewerNext'),
  viewerDownload: document.getElementById('viewerDownload'),
};

const transparentPixel = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

const thumbnailObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const img = entry.target;
        const src = img.dataset.src;
        if (src && img.src !== src) img.src = src;
        thumbnailObserver.unobserve(img);
      }
    }, {
      root: null,
      rootMargin: '800px 0px',
      threshold: 0.01,
    })
  : null;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function niceName(fileName) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function folderLabel(folder) {
  return folder === 'root' ? 'Root' : folder;
}

function fileExt(fileName) {
  const match = fileName.match(/\.([^.]+)$/);
  return match ? `.${match[1].toLowerCase()}` : '-';
}

function buildAlbums(images) {
  const counts = new Map();
  for (const item of images) counts.set(item.album, (counts.get(item.album) || 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function getFilteredImages() {
  const search = state.search.trim().toLowerCase();
  return state.allImages.filter((item) => {
    const albumMatch = state.activeAlbum === 'all' || item.album === state.activeAlbum;
    if (!albumMatch) return false;
    if (!search) return true;
    return [item.name, item.album, item.path].join(' ').toLowerCase().includes(search);
  });
}

function debounce(callback, delay) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
  });
}

async function preloadPreview(item) {
  const src = item?.previewSrc;
  if (!src || state.previewCache.has(src)) return;

  state.previewCache.add(src);
  try {
    const image = await loadImage(src);
    if ('decode' in image) await image.decode().catch(() => {});
  } catch {
    state.previewCache.delete(src);
  }
}

function preloadAdjacent(list, index) {
  const candidates = [list[index - 1], list[index + 1]].filter(Boolean);
  for (const item of candidates) void preloadPreview(item);
}

function setViewMode(mode) {
  state.viewMode = mode;
  elements.gallery.classList.remove('mode-grid', 'mode-list', 'mode-large');
  elements.gallery.classList.add(`mode-${mode}`);

  elements.viewButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === mode);
  });

  if (state.activeItem) updateContentPanel(state.activeItem, getFilteredImages());
}

function setActiveTab(tab) {
  state.activeTab = tab;
  elements.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  elements.detailsPanel.classList.toggle('hidden', tab !== 'details');
  elements.contentPanel.classList.toggle('hidden', tab !== 'content');
  elements.colorsPanel.classList.toggle('hidden', tab !== 'colors');

  if (state.activeItem) {
    if (tab === 'colors') void renderColorPanel(state.activeItem);
    if (tab === 'content') updateContentPanel(state.activeItem, getFilteredImages());
  }
}

async function showInspectorPreview(item) {
  const requestId = ++state.inspectorRequestId;
  const fallbackSrc = item.thumbSrc || item.previewSrc || item.originalSrc || item.path;
  const previewSrc = item.previewSrc || fallbackSrc;

  elements.previewImage.src = fallbackSrc;
  elements.previewImage.classList.toggle('is-loading', previewSrc !== fallbackSrc);
  elements.previewStatus.textContent = previewSrc !== fallbackSrc ? 'Loading web preview…' : 'Preview ready';

  if (previewSrc === fallbackSrc) return;

  try {
    const image = await loadImage(previewSrc);
    if ('decode' in image) await image.decode().catch(() => {});
    if (requestId !== state.inspectorRequestId || state.activeItem !== item) return;

    elements.previewImage.src = previewSrc;
    elements.previewImage.classList.remove('is-loading');
    elements.previewStatus.textContent = `Web preview · ${formatBytes(item.previewSize)}`;
  } catch {
    if (requestId !== state.inspectorRequestId || state.activeItem !== item) return;
    elements.previewImage.classList.remove('is-loading');
    elements.previewStatus.textContent = 'Using thumbnail preview';
  }
}

function setActiveImage(index, list) {
  const item = list[index];
  if (!item) return;

  state.activeIndex = index;
  state.activeItem = item;
  elements.previewImage.alt = item.alt;
  elements.metaFile.textContent = item.name;
  elements.metaFolder.textContent = folderLabel(item.album);
  elements.metaSize.textContent = formatBytes(item.size);
  elements.metaPreviewSize.textContent = formatBytes(item.previewSize);
  elements.metaDimensions.textContent = item.width && item.height ? `${item.width} × ${item.height}` : '-';
  elements.openLink.href = item.originalSrc || item.path;
  elements.openLink.setAttribute('download', item.name);
  elements.viewLargeButton.disabled = false;
  elements.previewButton.disabled = false;

  updateContentPanel(item, list);
  void showInspectorPreview(item);
  preloadAdjacent(list, index);

  elements.gallery.querySelectorAll('.card').forEach((card) => {
    card.classList.toggle('is-active', Number(card.dataset.index) === index);
  });

  if (state.activeTab === 'colors') void renderColorPanel(item);
}

function renderAlbums(albums) {
  const fragment = document.createDocumentFragment();
  const albumEntries = [
    ['all', 'All photos', state.allImages.length],
    ...albums.map(([album, count]) => [album, folderLabel(album), count]),
  ];

  for (const [albumKey, label, count] of albumEntries) {
    const li = document.createElement('li');
    li.className = 'album-item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `album-button${state.activeAlbum === albumKey ? ' is-active' : ''}`;

    const name = document.createElement('strong');
    name.textContent = label;
    const total = document.createElement('span');
    total.textContent = String(count);
    button.append(name, total);

    button.addEventListener('click', () => {
      state.activeAlbum = albumKey;
      state.activeIndex = 0;
      render();
    });

    li.appendChild(button);
    fragment.appendChild(li);
  }

  elements.albumList.replaceChildren(fragment);
}

function renderGallery(images) {
  elements.gallery.innerHTML = '';
  const fragment = document.createDocumentFragment();

  images.forEach((item, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.index = String(index);
    card.setAttribute('aria-label', `Select ${item.name}`);

    const figure = document.createElement('figure');
    const image = document.createElement('img');
    image.src = transparentPixel;
    image.dataset.src = item.thumbSrc || item.previewSrc || item.originalSrc || item.path;
    image.alt = item.alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.fetchPriority = 'low';
    if (item.thumbWidth) image.width = item.thumbWidth;
    if (item.thumbHeight) image.height = item.thumbHeight;

    const caption = document.createElement('figcaption');
    const title = document.createElement('strong');
    title.textContent = item.name;
    const album = document.createElement('span');
    album.textContent = folderLabel(item.album);
    caption.append(title, album);
    figure.append(image, caption);
    card.appendChild(figure);

    card.addEventListener('click', () => setActiveImage(index, images));
    card.addEventListener('dblclick', () => openViewer(index, images));
    card.addEventListener('pointerenter', () => void preloadPreview(item), { once: true });
    fragment.appendChild(card);
  });

  elements.gallery.replaceChildren(fragment);
  elements.gallery.querySelectorAll('img[data-src]').forEach((img, index) => {
    if (index === state.activeIndex) {
      img.src = img.dataset.src;
    } else if (thumbnailObserver) {
      thumbnailObserver.observe(img);
    } else {
      img.src = img.dataset.src;
    }
  });

  elements.emptyState.classList.toggle('hidden', images.length !== 0);
  elements.galleryHint.textContent = images.length
    ? `${images.length} image${images.length === 1 ? '' : 's'} visible`
    : 'No images match the current filter';

  if (images.length) {
    setActiveImage(Math.min(state.activeIndex, images.length - 1), images);
  } else {
    state.activeItem = null;
    state.inspectorRequestId += 1;
    elements.previewImage.removeAttribute('src');
    elements.previewStatus.textContent = 'Select an image';
    elements.metaFile.textContent = '-';
    elements.metaFolder.textContent = '-';
    elements.metaDimensions.textContent = '-';
    elements.metaSize.textContent = '-';
    elements.metaPreviewSize.textContent = '-';
    elements.openLink.href = '#';
    elements.viewLargeButton.disabled = true;
    elements.previewButton.disabled = true;
    updateContentPanel(null, images);
    renderColorPanel(null);
  }
}

function updateContentPanel(item, filteredList) {
  if (!item) {
    elements.contentSummary.textContent = 'Select an image to inspect its file information.';
    elements.contentAlbum.textContent = '-';
    elements.contentPath.textContent = '-';
    elements.contentExt.textContent = '-';
    elements.contentView.textContent = viewModeLabel();
    return;
  }

  const folderCount = filteredList.filter((image) => image.album === item.album).length;
  elements.contentSummary.textContent = `${niceName(item.name)} is stored in ${folderLabel(item.album)} and is part of the current ${filteredList.length} image view.`;
  elements.contentAlbum.textContent = `${folderLabel(item.album)} (${folderCount})`;
  elements.contentPath.textContent = item.path;
  elements.contentExt.textContent = fileExt(item.name);
  elements.contentView.textContent = viewModeLabel();
}

function viewModeLabel() {
  if (state.viewMode === 'grid') return 'Grid';
  if (state.viewMode === 'list') return 'List';
  return 'Large';
}

function quantizeColor(r, g, b) {
  const step = 32;
  return [
    Math.min(255, Math.round(r / step) * step),
    Math.min(255, Math.round(g / step) * step),
    Math.min(255, Math.round(b / step) * step),
  ];
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

async function extractPalette(src) {
  if (state.paletteCache.has(src)) return state.paletteCache.get(src);

  const promise = loadImage(src).then((image) => {
    const maxSize = 64;
    const scale = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight, 1);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    const histogram = new Map();

    for (let i = 0; i < data.length; i += 8) {
      if (data[i + 3] < 160) continue;
      const [r, g, b] = quantizeColor(data[i], data[i + 1], data[i + 2]);
      const key = `${r},${g},${b}`;
      const entry = histogram.get(key) || { count: 0, rgb: [r, g, b] };
      entry.count += 1;
      histogram.set(key, entry);
    }

    return Array.from(histogram.values())
      .sort((a, b) => b.count - a.count)
      .filter((entry, index, array) => {
        const [r, g, b] = entry.rgb;
        return array.slice(0, index).every((other) => {
          const [or, og, ob] = other.rgb;
          return Math.sqrt((r - or) ** 2 + (g - og) ** 2 + (b - ob) ** 2) > 40;
        });
      })
      .slice(0, 5)
      .map((entry) => {
        const [r, g, b] = entry.rgb;
        return { hex: rgbToHex(r, g, b), rgb: `rgb(${r}, ${g}, ${b})` };
      });
  });

  state.paletteCache.set(src, promise);
  return promise;
}

async function renderColorPanel(item) {
  if (!item) {
    elements.colorSummary.textContent = 'Select an image to generate a color palette.';
    elements.colorPalette.innerHTML = '';
    return;
  }

  elements.colorSummary.textContent = `Extracting dominant colors from ${item.name}…`;
  elements.colorPalette.innerHTML = '';

  try {
    const colors = await extractPalette(item.thumbSrc || item.previewSrc || item.originalSrc || item.path);
    if (state.activeItem !== item || state.activeTab !== 'colors') return;

    if (!colors.length) {
      elements.colorSummary.textContent = 'No strong dominant colors were found for this image.';
      return;
    }

    elements.colorSummary.textContent = `Showing the top ${colors.length} dominant colors from ${item.name}.`;
    const fragment = document.createDocumentFragment();
    colors.forEach((color) => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      const chip = document.createElement('div');
      chip.className = 'color-chip';
      chip.style.background = color.hex;
      const text = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = color.hex;
      const span = document.createElement('span');
      span.textContent = color.rgb;
      text.append(strong, span);
      swatch.append(chip, text);
      fragment.appendChild(swatch);
    });
    elements.colorPalette.replaceChildren(fragment);
  } catch {
    elements.colorSummary.textContent = 'Could not extract colors from this image.';
    elements.colorPalette.innerHTML = '';
  }
}

async function showViewerImage(item) {
  const requestId = ++state.viewerRequestId;
  const fallbackSrc = item.thumbSrc || item.previewSrc || item.originalSrc || item.path;
  const previewSrc = item.previewSrc || fallbackSrc;

  elements.viewerTitle.textContent = item.name;
  elements.viewerMeta.textContent = [
    item.width && item.height ? `${item.width} × ${item.height}` : null,
    formatBytes(item.previewSize),
  ].filter(Boolean).join(' · ');
  elements.viewerDownload.href = item.originalSrc || item.path;
  elements.viewerDownload.setAttribute('download', item.name);
  elements.viewerImage.alt = item.alt;
  elements.viewerImage.src = fallbackSrc;
  elements.viewerImage.classList.toggle('is-loading', previewSrc !== fallbackSrc);
  elements.viewerStatus.textContent = previewSrc !== fallbackSrc ? 'Loading web preview…' : 'Preview ready';

  if (previewSrc === fallbackSrc) return;

  try {
    const image = await loadImage(previewSrc);
    if ('decode' in image) await image.decode().catch(() => {});
    if (requestId !== state.viewerRequestId) return;

    elements.viewerImage.src = previewSrc;
    elements.viewerImage.classList.remove('is-loading');
    elements.viewerStatus.textContent = `Web preview ready · ${formatBytes(item.previewSize)}`;
    state.previewCache.add(previewSrc);
    preloadAdjacent(state.viewerList, state.viewerIndex);
  } catch {
    if (requestId !== state.viewerRequestId) return;
    elements.viewerImage.classList.remove('is-loading');
    elements.viewerStatus.textContent = 'Web preview failed; showing thumbnail';
  }
}

function openViewer(index = state.activeIndex, list = getFilteredImages()) {
  const item = list[index];
  if (!item) return;

  state.viewerList = list;
  state.viewerIndex = index;
  elements.lightbox.classList.remove('hidden');
  elements.lightbox.setAttribute('aria-hidden', 'false');
  document.body.classList.add('viewer-open');
  void showViewerImage(item);
  elements.viewerClose.focus();
}

function closeViewer() {
  state.viewerRequestId += 1;
  elements.lightbox.classList.add('hidden');
  elements.lightbox.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('viewer-open');
  elements.viewLargeButton.focus();
}

function stepViewer(direction) {
  if (!state.viewerList.length) return;
  state.viewerIndex = (state.viewerIndex + direction + state.viewerList.length) % state.viewerList.length;
  void showViewerImage(state.viewerList[state.viewerIndex]);
}

function render() {
  const albums = buildAlbums(state.allImages);
  renderAlbums(albums);
  renderGallery(getFilteredImages());
  setViewMode(state.viewMode);
  setActiveTab(state.activeTab);
}

async function loadManifest() {
  const response = await fetch(MANIFEST_URL);
  if (!response.ok) throw new Error(`Failed to load ${MANIFEST_URL}`);
  return response.json();
}

async function init() {
  try {
    const manifest = await loadManifest();
    state.allImages = manifest.map((item) => ({ ...item, alt: niceName(item.name) }));
    render();
  } catch {
    elements.galleryHint.textContent = 'Build the project to generate images.json';
    elements.emptyState.classList.remove('hidden');
    elements.emptyState.querySelector('h3').textContent = 'No gallery manifest found';
    elements.emptyState.querySelector('p').textContent = `Run the build step so ${MANIFEST_URL} is generated from ${IMAGE_ROOT}/.`;
  }
}

const updateSearch = debounce((value) => {
  state.search = value;
  state.activeIndex = 0;
  render();
}, 180);

elements.searchInput.addEventListener('input', (event) => updateSearch(event.target.value));
elements.viewButtons.forEach((button) => button.addEventListener('click', () => setViewMode(button.dataset.view)));
elements.tabButtons.forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.tab)));
elements.viewLargeButton.addEventListener('click', () => openViewer());
elements.previewButton.addEventListener('click', () => openViewer());
elements.viewerClose.addEventListener('click', closeViewer);
elements.viewerPrevious.addEventListener('click', () => stepViewer(-1));
elements.viewerNext.addEventListener('click', () => stepViewer(1));
elements.lightbox.addEventListener('click', (event) => {
  if (event.target === elements.lightbox) closeViewer();
});

document.addEventListener('keydown', (event) => {
  if (elements.lightbox.classList.contains('hidden')) return;
  if (event.key === 'Escape') closeViewer();
  if (event.key === 'ArrowLeft') stepViewer(-1);
  if (event.key === 'ArrowRight') stepViewer(1);
});

init();
