// app.js: bootstrap, state, hash router, live reload
import { renderTree, highlightActiveTree } from './tree.js';
import { renderDoc } from './render.js';
import { initSearch } from './search.js';

const state = {
  sources: [],
  currentSource: '',
  currentPath: '',
};

const treeNav = document.getElementById('tree');
const searchInput = document.getElementById('search');
const resultsUl = document.getElementById('results');
const docTitleEl = document.getElementById('doc-title');
const docArticle = document.getElementById('doc');
const tocNav = document.getElementById('toc');

function parseHash(hash) {
  if (!hash || hash === '#' || hash === '#/') return null;
  const raw = hash.replace(/^#\/?/, '');
  const [docPart, headingId] = raw.split('#');
  const slashIdx = docPart.indexOf('/');
  if (slashIdx === -1) return null;
  const source = docPart.slice(0, slashIdx);
  const path = docPart.slice(slashIdx + 1);
  return { source, path, headingId: headingId || null };
}

async function fetchTree() {
  const res = await fetch('/api/tree');
  if (!res.ok) return [];
  const data = await res.json();
  return data.sources || [];
}

function scrollToHeading(headingId) {
  if (headingId) {
    const target = document.getElementById(headingId);
    if (target) {
      target.scrollIntoView();
      return;
    }
  }
  window.scrollTo(0, 0);
}

function showError(msg) {
  docTitleEl.textContent = msg;
  document.title = `${msg} — docs`;
  docArticle.innerHTML = `<p>${msg}</p>`;
  tocNav.innerHTML = '';
}

async function loadDocument(source, path, headingId, force = false) {
  if (!force && state.currentSource === source && state.currentPath === path) {
    highlightActiveTree(treeNav, source, path);
    scrollToHeading(headingId);
    return;
  }

  try {
    const res = await fetch(`/api/doc?source=${encodeURIComponent(source)}&path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      showError('Document not found');
      return;
    }
    const doc = await res.json();
    state.currentSource = source;
    state.currentPath = path;

    renderDoc(docArticle, docTitleEl, tocNav, doc, state.sources);
    highlightActiveTree(treeNav, source, path);
    scrollToHeading(headingId);
  } catch {
    showError('Error loading document');
  }
}

function handleRoute() {
  const route = parseHash(location.hash);
  if (!route) {
    const firstSource = state.sources?.[0];
    const firstFile = firstSource?.files?.[0];
    if (firstSource && firstFile) {
      location.hash = `#/${firstSource.name}/${firstFile.path}`;
    }
    return;
  }
  loadDocument(route.source, route.path, route.headingId);
}

function initSSE() {
  const events = new EventSource('/api/events');
  events.onerror = () => {};
  events.addEventListener('change', async (e) => {
    try {
      const data = JSON.parse(e.data);
      fetchTree().then((sources) => {
        state.sources = sources;
        renderTree(treeNav, state.sources, state.currentSource, state.currentPath);
      }).catch(() => {});

      if (data.source === state.currentSource && data.path === state.currentPath) {
        const scrollY = window.scrollY;
        await loadDocument(state.currentSource, state.currentPath, null, true);
        window.scrollTo(0, scrollY);
      }
    } catch {}
  });
}

async function initApp() {
  try {
    state.sources = await fetchTree();
    renderTree(treeNav, state.sources);
    initSearch(searchInput, resultsUl);
    initSSE();

    window.addEventListener('hashchange', () => {
      handleRoute();
    });

    handleRoute();
  } catch {}
}

initApp();
