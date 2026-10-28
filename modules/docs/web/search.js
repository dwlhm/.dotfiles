// search.js: search input, keyboard shortcuts, results dropdown
import { cleanTitle } from './render.js';

function renderSearchResults(resultsUl, searchInput, results) {
  resultsUl.innerHTML = '';
  for (const item of results) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#/${item.source}/${item.path}`;

    const plainTitle = cleanTitle(item.title);
    const titleSpan = document.createElement('span');
    titleSpan.className = 'res-title';
    titleSpan.textContent = plainTitle;
    a.appendChild(titleSpan);

    const plainSnippet = item.snippet ? cleanTitle(item.snippet) : '';
    if (item.snippet && item.snippet !== item.title && plainSnippet !== plainTitle) {
      const snippetSpan = document.createElement('span');
      snippetSpan.className = 'res-snippet';
      snippetSpan.textContent = item.snippet;
      a.appendChild(snippetSpan);
    }

    a.addEventListener('click', () => {
      resultsUl.innerHTML = '';
      searchInput.value = '';
    });

    li.appendChild(a);
    resultsUl.appendChild(li);
  }
}

export function initSearch(searchInput, resultsUl) {
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
      const tag = document.activeElement?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !document.activeElement?.isContentEditable) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    }
    if (e.key === 'Escape' && document.activeElement === searchInput) {
      resultsUl.innerHTML = '';
      searchInput.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
      resultsUl.innerHTML = '';
    }
  });

  searchInput.addEventListener('input', async () => {
    const query = searchInput.value.trim();
    if (!query) {
      resultsUl.innerHTML = '';
      return;
    }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const data = await res.json();
      renderSearchResults(resultsUl, searchInput, data.results || []);
    } catch {}
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const firstLink = resultsUl.querySelector('li a');
      if (firstLink) {
        e.preventDefault();
        firstLink.click();
        resultsUl.innerHTML = '';
        searchInput.value = '';
        searchInput.blur();
      }
    }
  });
}
