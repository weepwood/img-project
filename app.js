const IMAGE_ROOT = './imgs';
const MANIFEST_URL = './images.json';

const state = {
  allImages: [],
  activeAlbum: 'all',
  search: '',
  activeIndex: 0,
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
};

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

function setActiveImage(index, list) {
  const item = list[index];
  if (!item) return;

  state.activeIndex = index;
  elements.previewImage.src = item.src;
  elements.previewImage.alt = item.alt;
  elements.metaFile.textContent = item.name;
  elements.metaFolder.textContent = item.album;
  elements.metaSize.textContent = formatBytes(item.size);
  elements.metaDimensions.textContent = item.dimensions || 'Loading...';
  elements.openLink.href = item.src;

  const img = new Image();
  img.onload = () => {
    elements.metaDimensions.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
  };
  img.src = item.src;

  elements.gallery.querySelectorAll('.card').forEach((card) => {
    card.classList.toggle('is-active', Number(card.dataset.index) === index);
  });
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
        <img src="${item.src}" alt="${item.alt}">
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
  elements.emptyState.classList.toggle('hidden', images.length !== 0);
  elements.galleryHint.textContent = images.length
    ? `${images.length} image${images.length === 1 ? '' : 's'} visible`
    : 'No images match the current filter';

  if (images.length) {
    setActiveImage(Math.min(state.activeIndex, images.length - 1), images);
  } else {
    elements.previewImage.removeAttribute('src');
    elements.metaFile.textContent = '-';
    elements.metaFolder.textContent = '-';
    elements.metaDimensions.textContent = '-';
    elements.metaSize.textContent = '-';
    elements.openLink.href = '#';
  }
}

function render() {
  const albums = buildAlbums(state.allImages);
  renderAlbums(albums);
  renderGallery(getFilteredImages());
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
      dimensions: item.dimensions || '',
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

init();
