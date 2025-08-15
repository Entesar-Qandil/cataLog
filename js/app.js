(() => {
  const API_LIST = 'https://cataas.com/api/cats';
  const API_IMG = (id) => `https://cataas.com/cat/${id}`;

  const viewEl = document.getElementById('view');
  const gridEl = viewEl.querySelector('.grid');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const linkBrowse = document.getElementById('link-browse');
  const linkFav = document.getElementById('link-fav');
  gridEl.setAttribute('aria-live', 'polite');

  const params = new URLSearchParams(location.search);
  const CONFIG = {
    limit: Number.parseInt(params.get('limit'), 10),
    rows: Number.parseInt(params.get('rows'), 10)
  };

  function safeReadLS(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)); } catch { return fallback; }
  }
  function safeWriteLS(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
  }
  function safeReadSS(key, fallback) {
    try { return JSON.parse(sessionStorage.getItem(key) ?? JSON.stringify(fallback)); } catch { return fallback; }
  }
  function safeWriteSS(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { }
  }

  function createStore(initial) {
    let state = { ...initial };
    const subs = new Set();
    return {
      get: () => state,
      set: (patch) => { state = { ...state, ...patch }; subs.forEach((fn) => fn(state)); },
      update: (fn) => { state = fn(state); subs.forEach((fn2) => fn2(state)); },
      subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); }
    };
  }

  const LS_FAVS_KEY = 'catalog.favs.v1';
  const favoritesSet = new Set(safeReadLS(LS_FAVS_KEY, []));
  function saveFavs() { safeWriteLS(LS_FAVS_KEY, [...favoritesSet]); }

  const SESSION_PAGES_KEY = 'catalog.pages.v1';
  const pageCache = safeReadSS(SESSION_PAGES_KEY, {});
  function writePageCache() { safeWriteSS(SESSION_PAGES_KEY, pageCache); }

  const BOOTSTRAP_BREAKPOINTS = { '': 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400 };

  function routeFromHash(h) { return h.startsWith('#/favorites') ? 'favorites' : 'browse'; }

  const store = createStore({
    route: routeFromHash(location.hash),
    page: 1,
    favPage: 1,
    hasNext: true,
    loading: false,
    requestSeq: 0,
    lastSize: 0
  });

  window.addEventListener('hashchange', () => {
    const r = routeFromHash(location.hash);
    store.set({ route: r, page: r === 'browse' ? 1 : store.get().page, favPage: r === 'favorites' ? 1 : store.get().favPage });
    render();
  });

  function setActiveLink() {
    const r = store.get().route;
    if (r === 'browse') { linkBrowse.setAttribute('aria-current', 'page'); linkFav.removeAttribute('aria-current'); }
    else { linkFav.setAttribute('aria-current', 'page'); linkBrowse.removeAttribute('aria-current'); }
  }

  function getColumnsFromGrid(el) {
    try {
      let bestCols = 1, bestMin = -1, w = window.innerWidth;
      el.classList.forEach((cls) => {
        const m = cls.match(/^row-cols(?:-([a-z]{2,3}))?-(\d+)$/);
        if (!m) return;
        const bp = m[1] || '';
        const cols = parseInt(m[2], 10);
        const min = BOOTSTRAP_BREAKPOINTS[bp] ?? 0;
        if (w >= min && min > bestMin) { bestMin = min; bestCols = cols; }
      });
      return bestCols;
    } catch { return 1; }
  }

  function getRowsPerPage() {
    if (Number.isFinite(CONFIG.rows) && CONFIG.rows > 0) return CONFIG.rows;
    const v = parseInt(gridEl.getAttribute('data-rows'), 10);
    return Number.isFinite(v) && v > 0 ? v : 3;
  }

  function getPageSize() {
    if (Number.isFinite(CONFIG.limit) && CONFIG.limit > 0) return CONFIG.limit;
    return getColumnsFromGrid(gridEl) * getRowsPerPage();
  }

  let fetchController = null;

  async function fetchPageIds(page) {
    const size = getPageSize();
    const key = `${page}:${size}`;
    if (pageCache[key]) return pageCache[key];
    if (fetchController) fetchController.abort();
    fetchController = new AbortController();
    const skip = (page - 1) * size;
    const url = `${API_LIST}?skip=${skip}&limit=${size}`;
    let res;
    try {
      res = await fetch(url, { signal: fetchController.signal });
    } catch (e) {
      throw new Error(`Network error`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
    let data = [];
    try { data = await res.json(); } catch { data = []; }
    const ids = data.map((c) => c.id || c._id).filter(Boolean);
    pageCache[key] = ids;
    writePageCache();
    return ids;
  }

  function skeletonCards(n) {
    const col = () => `<div class="col"><article class="card h-100" aria-busy="true"><figure class="card__media mb-0"></figure></article></div>`;
    return Array.from({ length: n }, col).join('');
  }

  function emptyState(message, withRetry) {
    const cta = withRetry ? `<button class="pager__btn" id="retry">Retry</button>` : '';
    return `<div class="col"><div class="p-4 text-center border rounded-3 bg-white"><div class="mb-2" aria-hidden="true" style="font-size:40px">🐾</div><p class="mb-0">${message}</p>${cta ? `<div class="text-center mt-2">${cta}</div>` : ''}</div></div>`;
  }

  function cardHTML(id) {
    const active = favoritesSet.has(id);
    return `<div class="col"><article class="card h-100"><figure class="card__media mb-0"><img loading="lazy" src="${API_IMG(id)}" alt="Cute cat ${id}"></figure><button class="fav" type="button" data-id="${id}" aria-pressed="${active ? 'true' : 'false'}">${active ? '★' : '☆'}</button></article></div>`;
  }

  function bindGridEvents() {
    gridEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.fav');
      if (!btn) return;
      const id = btn.dataset.id;
      if (favoritesSet.has(id)) favoritesSet.delete(id); else favoritesSet.add(id);
      saveFavs();
      const active = favoritesSet.has(id);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.textContent = active ? '★' : '☆';
      if (store.get().route === 'favorites' && !active) renderFavorites();
    }, { passive: true });

    gridEl.addEventListener('click', (e) => {
      const retry = e.target.closest('#retry');
      if (!retry) return;
      renderBrowse();
    });
  }

  async function renderBrowse() {
    const mySeq = store.get().requestSeq + 1;
    store.set({ requestSeq: mySeq });
    setActiveLink();
    const size = getPageSize();
    gridEl.innerHTML = skeletonCards(size);
    prevBtn.hidden = false;
    nextBtn.hidden = false;
    store.set({ loading: true });
    gridEl.setAttribute('aria-busy', 'true');
    updatePager();
    try {
      const ids = await fetchPageIds(store.get().page);
      if (mySeq !== store.get().requestSeq) return;
      const hasNext = ids.length === size;
      store.set({ hasNext });
      gridEl.innerHTML = ids.length ? ids.map(cardHTML).join('') : emptyState(`No cats found for page ${store.get().page} (size ${size}).`, true);
    } catch (e) {
      if (mySeq !== store.get().requestSeq) return;
      store.set({ hasNext: false });
      gridEl.innerHTML = emptyState(`Failed to load cats: ${e.message}`, true);
    } finally {
      if (mySeq !== store.get().requestSeq) return;
      store.set({ loading: false });
      gridEl.removeAttribute('aria-busy');
      updatePager();
    }
  }

  function renderFavorites() {
    setActiveLink();
    const ids = [...favoritesSet];
    if (!ids.length) {
      prevBtn.hidden = true;
      nextBtn.hidden = true;
      updatePager();
      gridEl.innerHTML = `<div class="col"><div class="p-4 text-center border rounded-3 bg-white"><div class="mb-2" aria-hidden="true" style="font-size:40px">🐾</div><p class="mb-0">No favorites yet.</p><div class="text-center mt-2"><a href="#/browse" class="pager__btn">Browse cats</a></div></div></div>`;
      return;
    }
    prevBtn.hidden = false;
    nextBtn.hidden = false;
    const size = getPageSize();
    const start = (store.get().favPage - 1) * size;
    const pageIds = ids.slice(start, start + size);
    const hasNext = start + size < ids.length;
    store.set({ hasNext });
    gridEl.innerHTML = pageIds.map(cardHTML).join('');
    updatePager();
  }

  function render() { if (store.get().route === 'favorites') renderFavorites(); else renderBrowse(); }

  function updatePager() {
    const s = store.get();
    const pageNum = s.route === 'browse' ? s.page : s.favPage;
    prevBtn.disabled = pageNum <= 1 || s.loading;
    nextBtn.disabled = !s.hasNext || s.loading;
  }

  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), ms); }; }

  const handleResize = debounce(() => {
    const size = getPageSize();
    if (size !== store.get().lastSize) {
      const newS = size;
      const newState = { ...store.get(), lastSize: newS, page: 1, favPage: 1 };
      Object.keys(pageCache).forEach((k) => delete pageCache[k]);
      safeWriteSS(SESSION_PAGES_KEY, {});
      store.set(newState);
      render();
    }
  }, 150);

  window.addEventListener('resize', handleResize);

  prevBtn.addEventListener('click', () => {
    const s = store.get();
    if (s.loading) return;
    if (s.route === 'browse') { if (s.page > 1) { store.set({ page: s.page - 1 }); renderBrowse(); } }
    else { if (s.favPage > 1) { store.set({ favPage: s.favPage - 1 }); renderFavorites(); } }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', () => {
    const s = store.get();
    if (s.loading) return;
    if (s.route === 'browse') { if (s.hasNext) { store.set({ page: s.page + 1 }); renderBrowse(); } }
    else { if (s.hasNext) { store.set({ favPage: s.favPage + 1 }); renderFavorites(); } }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  bindGridEvents();
  if (!location.hash) location.hash = '#/browse';
  store.set({ lastSize: getPageSize() });
  render();
})();
