/* Native-DOM port of SNEEZE ticker-page selection, background and archive
   galleries (source modules64/67/68/69). No marquee, Shopify or Vimeo runtime. */
export function createArchiveSelector(root, {resetControl = null, onShift = () => {}} = {}) {
  const captions = [...root.querySelectorAll('[data-ticker-caption]')];
  const backgrounds = [...root.querySelectorAll('[data-ticker-background]')];
  const defaultBackground = root.querySelector('[data-default-background]');
  const ticker = root.querySelector('.ticker');
  const byId = elements => new Map(elements.map(element => [element.getAttribute('data-id'), element]));
  const captionIds = byId(captions), backgroundIds = byId(backgrounds);
  const ownedRootClass = !root.classList.contains('archive-media-selector');
  const ownedReadyClass = ticker && !ticker.classList.contains('is-ready');
  const originalShift = ticker?.classList.contains('shift-up') || false;
  const initial = new Map([...captions, ...backgrounds, defaultBackground].filter(Boolean).map(element => [element, {
    visible:element.classList.contains('is-visible'), active:element.classList.contains('is-active'),
    videoLoaded:element.classList.contains('video-loaded')
  }]));
  const zoomTimers = new Map(), videoStates = new Map();
  let activeCaption = null, activeBackground = defaultBackground, selectedId = null, destroyed = false;
  root.classList.add('archive-media-selector');
  ticker?.classList.add('is-ready');

  function hydrate(element) {
    for (const node of element.querySelectorAll('[data-src],[data-srcset]')) {
      for (const attribute of ['src','srcset']) {
        const value = node.getAttribute(`data-${attribute}`);
        if (value !== null) { node.setAttribute(attribute,value); node.removeAttribute(`data-${attribute}`); }
      }
    }
  }
  function loadThumbs(caption) {
    caption.querySelectorAll('[data-thumb]').forEach(thumb => hydrate(thumb));
  }
  function clearZoomTimer(caption) {
    if (zoomTimers.has(caption)) { clearTimeout(zoomTimers.get(caption)); zoomTimers.delete(caption); }
  }
  function hideCaption(caption) {
    if (!caption) return;
    clearZoomTimer(caption); caption.classList.remove('is-visible');
    caption.querySelectorAll('[data-zoom]').forEach(zoom => {
      zoom.classList.remove('is-visible');
      zoom.querySelectorAll('img').forEach(image => image.classList.remove('is-visible'));
    });
  }
  function showCaption(caption) {
    clearZoomTimer(caption); loadThumbs(caption);
    caption.querySelectorAll('[data-zoom]').forEach(hydrate);
    caption.classList.add('is-visible');
  }
  function videoState(background) {
    if (videoStates.has(background)) return videoStates.get(background);
    const video = background.querySelector('video');
    if (!video) return null;
    const state = {video, hydrated:false, listening:false, token:0, ready:false};
    state.canPlay = () => {
      state.listening = false; video.removeEventListener('canplay',state.canPlay);
      state.ready = true;
      if (!destroyed && activeBackground === background) play(background,state);
    };
    videoStates.set(background,state); return state;
  }
  function play(background,state) {
    const ticket = ++state.token;
    background.classList.add('video-loaded');
    state.video.setAttribute('autoplay','');
    const rejected = () => {
      if (!destroyed && ticket === state.token && activeBackground === background)
        background.classList.remove('video-loaded'); // Keep the picture poster visible.
    };
    try { const result = state.video.play(); result?.catch(rejected); } catch { rejected(); }
  }
  function hideBackground(background) {
    if (!background) return;
    background.classList.remove('is-active');
    const state = videoStates.get(background);
    if (state) {
      ++state.token; state.video.pause();
      state.video.removeEventListener('canplay',state.canPlay); state.listening = false;
    }
  }
  function showBackground(background) {
    if (!background) return;
    background.querySelectorAll('picture.lazy').forEach(picture => {
      hydrate(picture); picture.classList.remove('lazy'); picture.classList.add('lazy-loaded');
    });
    background.classList.add('is-active');
    const state = videoState(background);
    if (!state) return;
    const {video} = state;
    video.muted = true; video.loop = true; video.playsInline = true;
    for (const attribute of ['muted','loop','playsinline']) video.setAttribute(attribute,'');
    if (!state.hydrated) {
      // First show must hydrate lazy sources even if this element previously
      // reported readiness for a different/pre-existing source.
      state.hydrated = true;
      video.addEventListener('canplay',state.canPlay); state.listening = true;
      hydrate(video);
      try { video.load(); } catch { background.classList.remove('video-loaded'); }
      return;
    }
    if (state.ready || video.readyState >= 3) { state.ready = true; play(background,state); return; }
    if (!state.listening) { video.addEventListener('canplay',state.canPlay); state.listening = true; }
  }
  function shift(value) { ticker?.classList.toggle('shift-up',value); onShift(value); }
  function select(id) {
    if (destroyed) return false;
    id = String(id);
    const caption = captionIds.get(id), background = backgroundIds.get(id);
    if (!caption && !background) return false;
    if (selectedId === id) return true;
    hideCaption(activeCaption); hideBackground(activeBackground);
    selectedId = id; activeCaption = caption || null; activeBackground = background || defaultBackground;
    if (activeCaption) showCaption(activeCaption);
    showBackground(activeBackground); shift(Boolean(activeCaption)); return true;
  }
  function reset() {
    if (destroyed) return;
    hideCaption(activeCaption); hideBackground(activeBackground);
    selectedId = null; activeCaption = null; activeBackground = defaultBackground;
    showBackground(defaultBackground); shift(false);
  }
  const within = (event,selector) => {
    const element = event.target?.closest?.(selector);
    return element && root.contains(element) ? element : null;
  };
  function click(event) {
    const zoom = within(event,'[data-zoom]');
    if (zoom) {
      const caption = zoom.closest('[data-ticker-caption]');
      if (caption !== activeCaption) return;
      event.preventDefault(); clearZoomTimer(caption);
      zoom.querySelectorAll('img').forEach(image => image.classList.remove('is-visible'));
      zoomTimers.set(caption,setTimeout(() => {
        zoomTimers.delete(caption);
        if (!destroyed) zoom.classList.remove('is-visible');
      },200));
      return;
    }
    const thumb = within(event,'[data-thumb]');
    if (thumb) {
      const caption = thumb.closest('[data-ticker-caption]');
      if (caption !== activeCaption) return;
      const overlay = caption.querySelector('[data-zoom]');
      if (!overlay) return;
      const image = overlay.querySelectorAll('img')[[...thumb.parentElement.children].indexOf(thumb)];
      if (!image) return;
      event.preventDefault(); clearZoomTimer(caption);
      overlay.querySelectorAll('img').forEach(node => node.classList.remove('is-visible'));
      overlay.classList.add('is-visible'); image.classList.add('is-visible'); return;
    }
    const item = within(event,'[data-ticker-item]');
    if (item) { event.preventDefault(); select(item.getAttribute('data-id')); }
  }
  function preload(event) {
    const item = within(event,'[data-ticker-item]');
    if (!item || (event.type === 'mouseover' && event.relatedTarget && item.contains(event.relatedTarget))) return;
    const caption = captionIds.get(item.getAttribute('data-id'));
    if (caption) loadThumbs(caption);
  }
  const resetClick = event => { event.preventDefault(); reset(); };
  root.addEventListener('click',click);
  root.addEventListener('mouseover',preload);
  root.addEventListener('touchstart',preload,{passive:true});
  resetControl?.addEventListener('click',resetClick);
  showBackground(defaultBackground);
  return {select,reset,destroy() {
    if (destroyed) return;
    destroyed = true;
    root.removeEventListener('click',click); root.removeEventListener('mouseover',preload);
    root.removeEventListener('touchstart',preload); resetControl?.removeEventListener('click',resetClick);
    for (const timer of zoomTimers.values()) clearTimeout(timer);
    zoomTimers.clear(); hideCaption(activeCaption);
    for (const [background] of videoStates) hideBackground(background);
    for (const [element,state] of initial) {
      element.classList.toggle('is-visible',state.visible); element.classList.toggle('is-active',state.active);
      element.classList.toggle('video-loaded',state.videoLoaded);
    }
    ticker?.classList.toggle('shift-up',originalShift);
    if (ownedReadyClass) ticker.classList.remove('is-ready');
    if (ownedRootClass) root.classList.remove('archive-media-selector');
  }};
}
