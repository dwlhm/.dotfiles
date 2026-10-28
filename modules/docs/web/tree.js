// tree.js: builds and manages nav#tree
import { cleanTitle } from './render.js';

function buildFolderHierarchy(files) {
  const root = { dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current.dirs.has(part)) {
        current.dirs.set(part, { dirs: new Map(), files: [] });
      }
      current = current.dirs.get(part);
    }
    current.files.push(f);
  }
  return root;
}

function renderFolderNode(node, sourceName, container) {
  for (const file of node.files) {
    const a = document.createElement('a');
    a.href = `#/${sourceName}/${file.path}`;
    a.textContent = cleanTitle(file.title);
    a.className = 'tree-file';
    container.appendChild(a);
  }

  for (const [dirName, childNode] of node.dirs.entries()) {
    const folderDiv = document.createElement('div');
    folderDiv.className = 'tree-folder';
    const label = document.createElement('div');
    label.className = 'tree-folder-name';
    label.textContent = dirName;
    folderDiv.appendChild(label);
    renderFolderNode(childNode, sourceName, folderDiv);
    container.appendChild(folderDiv);
  }
}

export function renderTree(treeNav, sources, currentSource = '', currentPath = '') {
  treeNav.innerHTML = '';
  for (const source of sources) {
    const details = document.createElement('details');
    details.className = 'tree-source';
    details.open = true;
    details.dataset.source = source.name;

    const summary = document.createElement('summary');
    summary.textContent = source.name;
    details.appendChild(summary);

    const hierarchy = buildFolderHierarchy(source.files || []);
    renderFolderNode(hierarchy, source.name, details);
    treeNav.appendChild(details);
  }

  if (currentSource && currentPath) {
    highlightActiveTree(treeNav, currentSource, currentPath);
  }
}

export function highlightActiveTree(treeNav, source, path) {
  const targetHref = `#/${source}/${path}`;
  for (const a of treeNav.querySelectorAll('a')) {
    if (a.getAttribute('href') === targetHref) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
    } else {
      a.classList.remove('active');
      a.removeAttribute('aria-current');
    }
  }
}
