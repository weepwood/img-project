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
};

const elements = {
  albumList: document.getElementById('albumList'),
  searchInput: document.getElementById('searchInput'),
  gallery: document.getElementById('gallery'),
  emptyState: document.getElementById('emptyState'),
  galleryHint: document.getElementById('galleryHint'),
  previewImage: document.getElementById('previewImage'),
  metaFile: document.getElementById('metaFile'),
  metaFolder: document.getElementById('metaFolder'),
  metaDimensions: document.getElementById('metaDimensions'),
  metaSize: document.getElementById('metaSize'),
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
};

const thumbnailObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }

        const img = entry.target;
        const src = img.dataset.src;
        if (src && img.src !== src) {
          img.src = src;
        }
        thumbnailObserver.unobserve(img);
      }
    }, {
      rootMargin: '240px 0px',
      threshold: 0.01,
    })
  : null;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return '-';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

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
  for (const item of images) {
    counts.set(item.album, (counts.get(item.album) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function getFilteredImages() {
  const search = state.search.trim().toLowerCase();
  return state.allImages.filter((item) => {
    const albumMatch = state.activeAlbum === 'all' || item.album === state.activeAlbum;
    if (!albumMatch) return false;
    if (!search) return true;

    return [item.name, item.album, item.path]
      .join(' ')
      .toLowerCase()
      .includes(search);
  });
}

function setViewMode(mode) {
  state.viewMode = mode;
  elements.gallery.classList.remove('mode-grid', 'mode-list', 'mode-large');
  elements.gallery.classList.add(`mode-${mode}`);

  elements.viewButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === mode);
  });

  if (state.activeItem) {
    updateContentPanel(state.activeItem, getFilteredImages());
  }
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
    if (tab === 'colors') {
      void renderColorPanel(state.activeItem);
    } else if (tab === 'content') {
      updateContentPanel(state.activeItem, getFilteredImages());
    }
  }
}

function setActiveImage(index, list) {
  const item = list[index];
  if (!item) return;

  state.activeIndex = index;
  state.activeItem = item;
  elements.previewImage.src = item.src;
  elements.previewImage.alt = item.alt;
  elements.metaFile.textContent = item.name;
  elements.metaFolder.textContent = item.album;
  elements.metaSize.textContent = formatBytes(item.size);
  elements.metaDimensions.textContent = 'Loading...';
  elements.openLink.href = item.src;

  updateContentPanel(item, list);

  const img = new Image();
  img.onload = () => {
    elements.metaDimensions.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
  };
  img.src = item.src;

  elements.gallery.querySelectorAll('.card').forEach((card) => {
    card.classList.toggle('is-active', Number(card.dataset.index) === index);
  });

  const activeThumb = elements.gallery.querySelector(`.card[data-index="${index}"] img`);
  if (activeThumb && activeThumb.dataset.src && activeThumb.src !== activeThumb.dataset.src) {
    activeThumb.src = activeThumb.dataset.src;
  }

  if (state.activeTab === 'colors') {
    void renderColorPanel(item);
  }
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
    button.innerHTML = `<strong>${label}</strong><span>${count}</span>`;
    button.addEventListener('click', () => {
      state.activeAlbum = albumKey;
      state.activeIndex = 0;
      render();
    });

    li.appendChild(button);
    fragment.appendChild(li);
  }

  elements.albumList.replaceChildren(fragment);
  elements.galleryHint.textContent = `${state.allImages.length} image${state.allImages.length === 1 ? '' : 's'} in ${albums.length} album${albums.length === 1 ? '' : 's'}`;
}

function renderGallery(images) {
  elements.gallery.innerHTML = '';
  const fragment = document.createDocumentFragment();

  images.forEach((item, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.index = String(index);
    card.setAttribute('aria-label', `Open ${item.name}`);
    card.innerHTML = `
      <figure>
        <img data-src="${item.src}" alt="${item.alt}" loading="lazy" decoding="async" fetchpriority="low">
        <figcaption>
          <strong>${item.name}</strong>
          <span>${item.album}</span>
        </figcaption>
      </figure>
    `;
    card.addEventListener('click', () => setActiveImage(index, images));
    fragment.appendChild(card);
  });

  elements.gallery.replaceChildren(fragment);
  elements.gallery.querySelectorAll('img[data-src]').forEach((img, index) => {
    if (index === state.activeIndex) {
      img.src = img.dataset.src;
      return;
    }

    if (thumbnailObserver) {
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
    elements.previewImage.removeAttribute('src');
    elements.metaFile.textContent = '-';
    elements.metaFolder.textContent = '-';
    elements.metaDimensions.textContent = '-';
    elements.metaSize.textContent = '-';
    elements.openLink.href = '#';
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
    elements.contentView.textContent = state.viewMode === 'grid' ? 'Grid' : state.viewMode === 'list' ? 'List' : 'Large';
    return;
  }

  const folderCount = filteredList.filter((image) => image.album === item.album).length;
  elements.contentSummary.textContent = `${niceName(item.name)} is stored in ${folderLabel(item.album)} and is part of the current ${filteredList.length} image view.`;
  elements.contentAlbum.textContent = `${folderLabel(item.album)} (${folderCount})`;
  elements.contentPath.textContent = item.path;
  elements.contentExt.textContent = fileExt(item.name);
  elements.contentView.textContent = state.viewMode === 'grid' ? 'Grid' : state.viewMode === 'list' ? 'List' : 'Large';
}

function quantizeColor(r, g, b) {
  const step = 32;
  const qr = Math.min(255, Math.round(r / step) * step);
  const qg = Math.min(255, Math.round(g / step) * step);
  const qb = Math.min(255, Math.round(b / step) * step);
  return [qr, qg, qb];
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

async function extractPalette(src) {
  if (state.paletteCache.has(src)) {
    return state.paletteCache.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const maxSize = 64;
        const scale = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight, 1);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (!ctx) {
          resolve([]);
          return;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(image, 0, 0, width, height);
        const { data } = ctx.getImageData(0, 0, width, height);
        const histogram = new Map();

        for (let i = 0; i < data.length; i += 8) {
          const alpha = data[i + 3];
          if (alpha < 160) {
            continue;
          }

          const [r, g, b] = quantizeColor(data[i], data[i + 1], data[i + 2]);
          const key = `${r},${g},${b}`;
          const entry = histogram.get(key) || { count: 0, rgb: [r, g, b] };
          entry.count += 1;
          histogram.set(key, entry);
        }

        const colors = Array.from(histogram.values())
          .sort((a, b) => b.count - a.count)
          .filter((entry, index, array) => {
            const [r, g, b] = entry.rgb;
            return array.slice(0, index).every((other) => {
              const [or, og, ob] = other.rgb;
              const distance = Math.sqrt((r - or) ** 2 + (g - og) ** 2 + (b - ob) ** 2);
              return distance > 40;
            });
          })
          .slice(0, 5)
          .map((entry, index) => {
            const [r, g, b] = entry.rgb;
            return {
              hex: rgbToHex(r, g, b),
              rgb: `rgb(${r}, ${g}, ${b})`,
              rank: index === 0 ? 'Primary' : `Rank ${index + 1}`,
            };
          });

        resolve(colors);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
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

  elements.colorSummary.textContent = `Extracting dominant colors from ${item.name}...`;
  elements.colorPalette.innerHTML = '';

  try {
    const colors = await extractPalette(item.src);
    if (state.activeItem !== item || state.activeTab !== 'colors') {
      return;
    }

    if (!colors.length) {
      elements.colorSummary.textContent = 'No strong dominant colors were found for this image.';
      return;
    }

    elements.colorSummary.textContent = `Showing the top ${colors.length} dominant colors from ${item.name}.`;
    elements.colorPalette.innerHTML = colors.map((color) => `
      <div class="color-swatch">
        <div class="color-chip" style="background:${color.hex};"></div>
        <div>
          <strong>${color.hex}</strong>
          <span>${color.rgb}</span>
        </div>
      </div>
    `).join('');
  } catch (error) {
    elements.colorSummary.textContent = 'Could not extract colors from this image.';
    elements.colorPalette.innerHTML = '';
  }
}

function render() {
  const albums = buildAlbums(state.allImages);
  renderAlbums(albums);
  renderGallery(getFilteredImages());
  setViewMode(state.viewMode);
  setActiveTab(state.activeTab);
}

async function loadManifest() {
  const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ${MANIFEST_URL}`);
  }
  return response.json();
}

async function init() {
  try {
    const manifest = await loadManifest();
    state.allImages = manifest.map((item) => ({
      ...item,
      alt: niceName(item.name),
    }));
    render();
  } catch (error) {
    elements.galleryHint.textContent = 'Build the project to generate images.json';
    elements.emptyState.classList.remove('hidden');
    elements.emptyState.querySelector('h3').textContent = 'No gallery manifest found';
    elements.emptyState.querySelector('p').textContent = `Run the build step so ${MANIFEST_URL} is generated from ${IMAGE_ROOT}/.`;
  }
}

elements.searchInput.addEventListener('input', (event) => {
  state.search = event.target.value;
  state.activeIndex = 0;
  render();
});

elements.viewButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setViewMode(button.dataset.view);
    if (state.activeItem) {
      updateContentPanel(state.activeItem, getFilteredImages());
    }
  });
});

elements.tabButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

init();
