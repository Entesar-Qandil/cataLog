(() => {
  const API_LIST = 'https://cataas.com/api/cats';
  const API_IMG = id => `https://cataas.com/cat/${id}`;

  const viewEl = document.getElementById('view');
  const gridEl = viewEl.querySelector('.grid');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const linkBrowse = document.getElementById('link-browse');
  const linkFav = document.getElementById('link-fav');

  const state = {
    route: routeFromHash(location.hash),
    page: 1,
    favPage: 1,
    hasNext: true,
    loading: false,
    reqId: 0,
    lastSize: 0
  };

  const LS_KEY = 'catalog.favs.v1';
  const favs = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));
  function saveFavs(){ localStorage.setItem(LS_KEY, JSON.stringify([...favs])); }

  const sessionKey = 'catalog.pages.v1';
  const sessionCache = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');
  let controller = null;

  const BREAKPOINTS = { '':0, sm:576, md:768, lg:992, xl:1200, xxl:1400 };

  window.addEventListener('hashchange', () => {
    state.route = routeFromHash(location.hash);
    if (state.route === 'browse') state.page = 1; else state.favPage = 1;
    render();
  });

  function routeFromHash(h){ return h.startsWith('#/favorites') ? 'favorites' : 'browse'; }

  function setActiveLink(){
    if (state.route === 'browse'){ linkBrowse.setAttribute('aria-current','page'); linkFav.removeAttribute('aria-current'); }
    else { linkFav.setAttribute('aria-current','page'); linkBrowse.removeAttribute('aria-current'); }
  }

  function getColumnsFromGrid(el){
    let bestCols = 1, bestMin = -1, w = window.innerWidth;
    el.classList.forEach(cls => {
      const m = cls.match(/^row-cols(?:-([a-z]{2,3}))?-(\d+)$/);
      if (!m) return;
      const bp = m[1] || '';
      const cols = parseInt(m[2], 10);
      const min = BREAKPOINTS[bp] ?? 0;
      if (w >= min && min > bestMin){ bestMin = min; bestCols = cols; }
    });
    return bestCols;
  }

  function getRowsPerPage(){
    const v = parseInt(gridEl.getAttribute('data-rows'), 10);
    return Number.isFinite(v) && v > 0 ? v : 3;
  }

  function getPageSize(){
    return getColumnsFromGrid(gridEl) * getRowsPerPage();
  }

  async function fetchPageIds(page){
    const size = getPageSize();
    const key = `${page}:${size}`;
    if (sessionCache[key]) return sessionCache[key];
    if (controller) controller.abort();
    controller = new AbortController();
    const skip = (page - 1) * size;
    const url = `${API_LIST}?skip=${skip}&limit=${size}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const ids = data.map(c => c.id || c._id).filter(Boolean);
    sessionCache[key] = ids;
    sessionStorage.setItem(sessionKey, JSON.stringify(sessionCache));
    return ids;
  }

  function skeletonCards(n){
    const col = () => `<div class="col"><article class="card h-100" aria-busy="true"><figure class="card__media mb-0" style="background:#e9edf5"></figure></article></div>`;
    return Array.from({ length: n }, col).join('');
  }

  function emptyState(message, withRetry){
    const cta = withRetry ? `<button class="pager__btn" id="retry">Retry</button>` : '';
    return `<div class="col"><div class="p-4 text-center border rounded-3 bg-white"><div class="mb-2" aria-hidden="true" style="font-size:40px">🐾</div><p class="mb-0">${message}</p>${cta ? `<div class="text-center mt-2">${cta}</div>` : ''}</div></div>`;
  }

  function cardHTML(id){
    const active = favs.has(id);
    return `<div class="col"><article class="card h-100"><figure class="card__media mb-0"><img loading="lazy" src="${API_IMG(id)}" alt="Cute cat ${id}"></figure><button class="fav" type="button" data-id="${id}" aria-pressed="${active ? 'true' : 'false'}">${active ? '★' : '☆'}</button></article></div>`;
  }

  function bindGridEvents(){
    gridEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.fav');
      if (!btn) return;
      const id = btn.dataset.id;
      if (favs.has(id)) favs.delete(id); else favs.add(id);
      saveFavs();
      const active = favs.has(id);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.textContent = active ? '★' : '☆';
      if (state.route === 'favorites' && !active){
        const col = btn.closest('.col');
        if (col) col.remove();
        if (!gridEl.children.length) renderFavorites();
      }
    }, { passive: true });

    gridEl.addEventListener('click', (e) => {
      const retry = e.target.closest('#retry');
      if (!retry) return;
      renderBrowse();
    });
  }

  async function renderBrowse(){
    const reqId = ++state.reqId;
    setActiveLink();
    const size = getPageSize();
    gridEl.innerHTML = skeletonCards(size);
    prevBtn.hidden = false;
    nextBtn.hidden = false;
    state.loading = true;
    updatePager();
    try{
      const ids = await fetchPageIds(state.page);
      if (reqId !== state.reqId) return;
      state.hasNext = ids.length === size;
      gridEl.innerHTML = ids.length ? ids.map(cardHTML).join('') : emptyState('No cats found, try again.', true);
    }catch{
      if (reqId !== state.reqId) return;
      gridEl.innerHTML = emptyState('Failed to load cats.', true);
      state.hasNext = false;
    }finally{
      if (reqId !== state.reqId) return;
      state.loading = false;
      updatePager();
    }
  }

  function renderFavorites(){
    setActiveLink();
    const ids = [...favs];
    if (!ids.length){
      prevBtn.hidden = true;
      nextBtn.hidden = true;
      updatePager();
      gridEl.innerHTML = `<div class="col"><div class="p-4 text-center border rounded-3 bg-white"><div class="mb-2" aria-hidden="true" style="font-size:40px">🐾</div><p class="mb-0">No favorites yet.</p><div class="text-center mt-2"><a href="#/browse" class="pager__btn">Browse cats</a></div></div></div>`;
      return;
    }
    prevBtn.hidden = false;
    nextBtn.hidden = false;
    const size = getPageSize();
    const start = (state.favPage - 1) * size;
    const pageIds = ids.slice(start, start + size);
    state.hasNext = start + size < ids.length;
    gridEl.innerHTML = pageIds.map(cardHTML).join('');
    updatePager();
  }

  function render(){ if (state.route === 'favorites') renderFavorites(); else renderBrowse(); }

  function updatePager(){
    const pageNum = state.route === 'browse' ? state.page : state.favPage;
    prevBtn.disabled = pageNum <= 1 || state.loading;
    nextBtn.disabled = !state.hasNext || state.loading;
  }

  function debounce(fn, ms){
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), ms); };
  }

  const handleResize = debounce(() => {
    const size = getPageSize();
    if (size !== state.lastSize){
      state.lastSize = size;
      state.page = 1;
      state.favPage = 1;
      for (const k in sessionCache) delete sessionCache[k];
      sessionStorage.removeItem(sessionKey);
      render();
    }
  }, 150);

  window.addEventListener('resize', handleResize);

  prevBtn.addEventListener('click', () => {
    if (state.loading) return;
    if (state.route === 'browse') {
      if (state.page > 1) { state.page--; renderBrowse(); }
    } else {
      if (state.favPage > 1) { state.favPage--; renderFavorites(); }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', () => {
    if (state.loading) return;
    if (state.route === 'browse') {
      if (state.hasNext) { state.page++; renderBrowse(); }
    } else {
      if (state.hasNext) { state.favPage++; renderFavorites(); }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  bindGridEvents();
  if (!location.hash) location.hash = '#/browse';
  state.lastSize = getPageSize();
  render();
})();
