// render.js: markdown parsing, syntax highlighting, link rewriting, TOC, copy buttons
import { marked } from './vendor/marked.esm.js';
import hljs from './vendor/highlight.min.js';

export function cleanTitle(raw) {
  if (!raw) return '';
  const text = String(raw).replace(/^#+\s*/, '').trim();
  try {
    const detached = document.createElement('span');
    detached.innerHTML = marked.parseInline(text);
    return (detached.textContent ?? text).trim();
  } catch {
    return text;
  }
}

export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function resolveWikiLink(name, sources) {
  const target = name.trim().toLowerCase();
  for (const src of sources) {
    for (const f of src.files || []) {
      const fileName = f.path.split('/').pop().replace(/\.md$/, '').toLowerCase();
      if (fileName === target) {
        return { source: src.name, path: f.path, title: f.title };
      }
    }
  }
  return null;
}

function processWikiLinks(container, sources) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement && node.parentElement.closest('pre, code, a')) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.nodeValue && node.nodeValue.includes('[[')
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    }
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const text = node.nodeValue;
    const regex = /\[\[([^\]]+)\]\]/g;
    if (!regex.test(text)) continue;
    regex.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let lastIdx = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
      }
      const raw = match[1];
      const pipeIdx = raw.indexOf('|');
      const target = (pipeIdx === -1 ? raw : raw.slice(0, pipeIdx)).trim();
      const label = (pipeIdx === -1 ? raw : raw.slice(pipeIdx + 1)).trim();

      const resolved = resolveWikiLink(target, sources);
      if (resolved) {
        const a = document.createElement('a');
        a.href = `#/${resolved.source}/${resolved.path}`;
        a.textContent = label;
        frag.appendChild(a);
      } else {
        const span = document.createElement('span');
        span.className = 'broken-link';
        span.textContent = label;
        frag.appendChild(span);
      }
      lastIdx = regex.lastIndex;
    }

    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    }
    node.parentNode.replaceChild(frag, node);
  }
}

function resolveRelativePath(baseDir, relPath) {
  const segments = baseDir ? baseDir.split('/') : [];
  for (const part of relPath.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  return segments.join('/');
}

function rewriteRelativeLinks(container, currentSource, currentPath) {
  const currentDir = currentPath.includes('/')
    ? currentPath.slice(0, currentPath.lastIndexOf('/'))
    : '';

  for (const a of container.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    if (!href || /^[a-z]+:/i.test(href) || href.startsWith('//')) continue;

    if (href.startsWith('#')) {
      if (!href.startsWith('#/')) {
        a.setAttribute('href', `#/${currentSource}/${currentPath}${href}`);
      }
      continue;
    }

    const [pathPart, hashPart] = href.split('#');
    if (pathPart.endsWith('.md')) {
      const resolved = resolveRelativePath(currentDir, pathPart);
      const hashSuffix = hashPart ? `#${hashPart}` : '';
      a.setAttribute('href', `#/${currentSource}/${resolved}${hashSuffix}`);
    }
  }
}

function setupCodeBlocks(container) {
  for (const pre of container.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    if (code) {
      hljs.highlightElement(code);
    }

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy';
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';

    copyBtn.addEventListener('click', async () => {
      const text = code ? code.innerText : pre.innerText;
      try {
        await navigator.clipboard.writeText(text);
      } catch {}
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = 'Copy';
      }, 2000);
    });

    pre.appendChild(copyBtn);
  }
}

function updateTOC(tocNav, article, currentSource, currentPath) {
  tocNav.innerHTML = '';
  const headings = article.querySelectorAll('h2, h3');
  if (headings.length === 0) return;

  const ul = document.createElement('ul');
  for (const h of headings) {
    const li = document.createElement('li');
    li.className = `toc-${h.tagName.toLowerCase()}`;
    const a = document.createElement('a');
    a.href = `#/${currentSource}/${currentPath}#${h.id}`;
    a.textContent = h.textContent;
    li.appendChild(a);
    ul.appendChild(li);
  }
  tocNav.appendChild(ul);
}

export function renderDoc(article, docTitleEl, tocNav, doc, sources) {
  const plainTitle = cleanTitle(doc.title || '');
  if (docTitleEl) docTitleEl.textContent = plainTitle;
  document.title = `${plainTitle} — docs`;

  const tokens = marked.lexer(doc.markdown || '');
  const firstH1Idx = tokens.findIndex((t) => t.type === 'heading' && t.depth === 1);
  if (firstH1Idx !== -1) {
    tokens.splice(firstH1Idx, 1);
  }
  article.innerHTML = marked.parser(tokens);
  for (const h1 of article.querySelectorAll('h1')) {
    h1.remove();
  }

  for (const h of article.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    h.id = slugify(h.textContent);
  }

  rewriteRelativeLinks(article, doc.source, doc.path);
  processWikiLinks(article, sources);
  setupCodeBlocks(article);
  if (tocNav) updateTOC(tocNav, article, doc.source, doc.path);
}
