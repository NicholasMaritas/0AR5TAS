// Reveal captions only after native scrolling settles; never drive the scroll itself.
export function alignedIndex(rects, top, height, tolerance = 1) {
  return rects.findIndex(rect => Math.abs(rect.top - top) <= tolerance && rect.bottom <= top + height + tolerance && rect.bottom > top);
}

export function createFadeScroll(container, { itemSelector = '[data-scroll-item]', delay = 400 } = {}) {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const hasScrollEnd = 'onscrollend' in container;
  const original = ['data-fade-scroll', 'data-fade-scroll-state'].map(name => container.getAttribute(name));
  let items = [], visible = null, waiting = null, revealTimer = 0, quietTimer = 0, frame = 0;
  let epoch = 0, touches = 0, touchScrolling = false, nativeMoving = false, suspended = false, destroyed = false;
  container.setAttribute('data-fade-scroll', '');
  function blocked() { return destroyed || suspended || document.hidden || (touchScrolling && touches > 0); }
  function hide() {
    epoch++;
    clearTimeout(revealTimer); clearTimeout(quietTimer); cancelAnimationFrame(frame);
    revealTimer = 0; quietTimer = 0; frame = 0; waiting = null;
    for (const item of items) item.removeAttribute('data-caption-visible');
    visible = null;
    if (!destroyed) container.setAttribute('data-fade-scroll-state', 'hidden');
  }
  function selectedItem() {
    const top = container.getBoundingClientRect().top + container.clientTop;
    const height = container.clientHeight;
    const rects = items.map(item => item.getBoundingClientRect());
    let index = alignedIndex(rects, top, height);
    // Reduced motion already allows free scrolling: keep stationary content readable.
    if (index < 0 && media.matches) {
      let maximum = 0;
      rects.forEach((rect, i) => {
        const shown = Math.max(0, Math.min(top + height, rect.bottom) - Math.max(top, rect.top));
        if (shown > maximum) { maximum = shown; index = i; }
      });
    }
    return items[index] || null;
  }
  function imageReady(item) {
    const image = item.querySelector('img');
    return !image || (image.complete && image.naturalWidth > 0);
  }
  function settled() {
    if (blocked() || nativeMoving) return;
    const item = selectedItem();
    if (!item || !imageReady(item)) return;
    const position = container.scrollTop;
    if (visible === item || (waiting?.item === item && Math.abs(waiting.position - position) <= .5)) return;
    clearTimeout(revealTimer);
    const token = epoch;
    waiting = { item, position };
    container.setAttribute('data-fade-scroll-state', 'waiting');
    revealTimer = setTimeout(() => {
      revealTimer = 0;
      if (token !== epoch || blocked() || nativeMoving || selectedItem() !== item || Math.abs(container.scrollTop - position) > .5 || !imageReady(item)) return;
      waiting = null; visible = item;
      item.setAttribute('data-caption-visible', '');
      container.setAttribute('data-fade-scroll-state', 'visible');
    }, delay);
  }
  function stableFrames() {
    if (blocked() || (hasScrollEnd && nativeMoving)) return;
    cancelAnimationFrame(frame);
    const token = epoch, position = container.scrollTop;
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (token !== epoch || blocked() || Math.abs(container.scrollTop - position) > .5) return;
        if (!hasScrollEnd) nativeMoving = false;
        settled();
      });
    });
  }
  function quietCheck() {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => { quietTimer = 0; stableFrames(); }, 180);
  }
  function scroll() {
    hide(); nativeMoving = true;
    if (touches > 0) touchScrolling = true;
    if (!hasScrollEnd) quietCheck();
  }
  function end() { nativeMoving = false; clearTimeout(quietTimer); settled(); }
  // Touching/clicking without scrolling must never hide or restart a caption.
  function touchStart(event) { touches = event.touches.length; }
  function touchEnd(event) {
    touches = event.touches.length;
    if (touches === 0 && touchScrolling) {
      touchScrolling = false;
      if (!nativeMoving) settled();
      else if (!hasScrollEnd) quietCheck();
    }
  }
  function suspend() { suspended = true; touches = 0; touchScrolling = false; hide(); }
  function resume() { suspended = false; nativeMoving = false; hide(); quietCheck(); }
  function visibility() { if (document.hidden) suspend(); else resume(); }
  function resize() { hide(); nativeMoving = false; quietCheck(); }
  function loaded() { if (!waiting && !visible) stableFrames(); }
  const listeners = [
    [container, 'scroll', scroll],
    [container, 'touchstart', touchStart], [container, 'touchend', touchEnd], [container, 'touchcancel', touchEnd],
    [window, 'pagehide', suspend], [window, 'pageshow', resume],
    [window, 'resize', resize], [document, 'visibilitychange', visibility],
    [container, 'load', loaded, true]
  ];
  if (hasScrollEnd) listeners.push([container, 'scrollend', end]);
  for (const [target, name, handler, capture = false] of listeners) target.addEventListener(name, handler, { passive: true, capture });
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  resizeObserver?.observe(container);
  media.addEventListener?.('change', resize);
  function refresh() {
    if (destroyed) return;
    hide(); items = [...container.querySelectorAll(itemSelector)];
    for (const item of items) item.removeAttribute('data-caption-visible');
    stableFrames();
  }
  refresh();
  return {
    refresh,
    destroy() {
      if (destroyed) return;
      hide(); destroyed = true;
      resizeObserver?.disconnect(); media.removeEventListener?.('change', resize);
      for (const [target, name, handler, capture = false] of listeners) target.removeEventListener(name, handler, capture);
      ['data-fade-scroll', 'data-fade-scroll-state'].forEach((name, i) => {
        if (original[i] === null) container.removeAttribute(name);
        else container.setAttribute(name, original[i]);
      });
    }
  };
}
