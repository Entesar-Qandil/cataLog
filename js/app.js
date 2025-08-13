(() => {
  const API_LIST = 'https://cataas.com/api/cats';
  const API_IMG = id => `https://cataas.com/cat/${id}`;

  const viewEl = document.getElementById('view');
  const gridEl = viewEl.querySelector('.grid');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const linkBrowse = document.getElementById('link-browse');
  const linkFav = document.getElementById('link-fav');

  const state = { route: routeFromHash(location.hash), page: 1, hasNext: true, loading: false, controller: null };

  const sessionKey = 'catalog.pages.v3';
  const sessionCache = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');

  const LS_KEY = 'catalog.favs.v1';
  const favs = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));

  function saveFavs() { localStorage.setItem(LS_KEY, JSON.stringify([...favs])); }

  window.addEventListener('hashchange', () => {
    state.route = routeFromHash(location.hash);
    if (state.route === 'browse') state.page = 1;
    render();
  });

  function routeFromHash(h) { return h.startsWith('#/favorites') ? 'favorites' : 'browse'; }

  function setActiveLink() {
    if (state.route === 'browse') {
      linkBrowse.setAttribute('aria-current', 'page');
      linkFav.removeAttribute('aria-current');
    } else {
      linkFav.setAttribute('aria-current', 'page');
      linkBrowse.removeAttribute('aria-current');
    }
  }

  function getCols() {
    const cls = Array.from(gridEl.classList).filter(c => c.startsWith('row-cols-'));
    const bpMin = { sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400 };
    let rules = [];
    for (const t of cls) {
      const parts = t.split('-');
      if (parts.length === 3) {
        const cols = parseInt(parts[2], 10);
        if (Number.isFinite(cols)) rules.push({ min: 0, cols });
      } else if (parts.length === 4) {
        const bp = parts[2];
        const cols = parseInt(parts[3], 10);
        const min = bpMin[bp] || 0;
        if (Number.isFinite(cols)) rules.push({ min, cols });
      }
    }
    rules.sort((a, b) => a.min - b.min);
    let w = window.innerWidth || document.documentElement.clientWidth || 0;
    let current = rules.length ? rules[0].cols : 1;
    for (const r of rules) if (w >= r.min) current = r.cols;
    return current || 1;
  }

  function getRows() {
    const r = parseInt(gridEl.dataset.rows || '3', 10);
    return Number.isFinite(r) && r > 0 ? r : 3;
  }

  function getPageSize() { return getCols() * getRows(); }

  async function fetchPageIds(page) {
    const PAGE_SIZE = getPageSize();
    if (sessionCache[PAGE_SIZE]?.[page]) return sessionCache[PAGE_SIZE][page];
    if (state.controller) state.controller.abort();
    state.controller = new AbortController();
    const skip = (page - 1) * PAGE_SIZE;
    const url = `${API_LIST}?skip=${skip}&limit=${PAGE_SIZE}`;
    const res = await fetch(url, { signal: state.controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const ids = data.map(c => c.id || c._id).filter(Boolean);
    sessionCache[PAGE_SIZE] ||= {};
    sessionCache[PAGE_SIZE][page] = ids;
    sessionStorage.setItem(sessionKey, JSON.stringify(sessionCache));
    return ids;
  }

  function skeletonCards(n = getPageSize()) {
    const col = () => `<div class="col">
      <article class="card h-100" aria-busy="true">
        <figure class="card__media mb-0" style="background:#e9edf5"></figure>
      </article>
    </div>`;
    return Array.from({ length: n }, col).join('');
  }

  function emptyState(message, cta = null) {
    const btn = cta ? `<div class="text-center mt-2">${cta}</div>` : '';
    return `<div class="col">
      <div class="p-4 text-center border rounded-3 bg-white">
        <div class="mb-2" aria-hidden="true" style="font-size:40px">🐾</div>
        <p class="mb-0">${message}</p>
        ${btn}
      </div>
    </div>`;
  }

  function cardHTML(id) {
    const active = favs.has(id);
    return `<div class="col">
      <article class="card h-100">
        <figure class="card__media mb-0">
          <img loading="lazy" src="${API_IMG(id)}" alt="Cute cat ${id}">
        </figure>
        <button class="fav" type="button" title="${active ? 'Remove from favorites' : 'Add to favorites'}"
                data-id="${id}" aria-pressed="${active ? 'true' : 'false'}">${active ? '★' : '☆'}</button>
      </article>
    </div>`;
  }

  function bindGridEvents() {
    gridEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.fav');
      if (!btn) return;
      const id = btn.dataset.id;
      if (favs.has(id)) favs.delete(id); else favs.add(id);
      saveFavs();
      const active = favs.has(id);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.textContent = active ? '★' : '☆';
      if (state.route === 'favorites' && !active) {
        const col = btn.closest('.col');
        if (col) col.remove();
        if (!gridEl.children.length) renderFavorites();
      }
    }, { passive: true });
  }

  async function renderBrowse() {
    setActiveLink();
    gridEl.innerHTML = skeletonCards(getPageSize());
    prevBtn.hidden = false;
    nextBtn.hidden = false;
    state.loading = true;
    try {
      const PAGE_SIZE = getPageSize();
      const ids = await fetchPageIds(state.page);
      state.hasNext = ids.length === PAGE_SIZE;
      gridEl.innerHTML = ids.map(cardHTML).join('') || emptyState('No cats found, try again.');
    } catch {
      gridEl.innerHTML = emptyState('Failed to load cats. Please try again.',
        `<button class="pager__btn" onclick="location.reload()">Reload</button>`);
      state.hasNext = false;
    } finally {
      state.loading = false;
      updatePager();
    }
  }

  function renderFavorites() {
    setActiveLink();
    prevBtn.hidden = true;
    nextBtn.hidden = true;
    const ids = [...favs];
    if (!ids.length) {
      gridEl.innerHTML = emptyState('No favorites yet.', `<a href="#/browse" class="pager__btn">Browse cats</a>`);
      return;
    }
    gridEl.innerHTML = ids.map(cardHTML).join('');
  }

  function render() {
    if (state.route === 'favorites') renderFavorites();
    else renderBrowse();
  }

  function updatePager() {
    prevBtn.disabled = state.page <= 1 || state.loading;
    nextBtn.disabled = !state.hasNext || state.loading;
  }

  prevBtn.addEventListener('click', () => {
    if (state.page > 1 && !state.loading) {
      state.page--;
      renderBrowse();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  nextBtn.addEventListener('click', () => {
    if (state.hasNext && !state.loading) {
      state.page++;
      renderBrowse();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.route === 'browse') {
        state.page = 1;
        renderBrowse();
      }
    }, 150);
  });

  bindGridEvents();
  if (!location.hash) location.hash = '#/browse';
  render();
})();
