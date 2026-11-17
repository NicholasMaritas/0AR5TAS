// Momentum and snapping belong to the browser. This controller only observes them.
// See research.json for the interaction design and platform sources.
export function predominantIndex(rects, viewportTop, viewportHeight) {
  const bottom = viewportTop + viewportHeight;
  let best = -1, mostVisible = 0, closest = Infinity;
  rects.forEach((rect, index) => {
    const visible = Math.max(0, Math.min(rect.bottom, bottom) - Math.max(rect.top, viewportTop));
    const distance = Math.abs((rect.top + rect.bottom) / 2 - (viewportTop + bottom) / 2);
    if (visible > mostVisible + .01 || (visible > 0 && Math.abs(visible - mostVisible) <= .01 && distance < closest)) {
      best = index; mostVisible = visible; closest = distance;
    }
  });
  return best;
}

export function createMomentumScroll(container, { itemSelector = '[data-scroll-item]', onActiveChange = () => {} } = {}) {
  let items = [], active = -1, readFrame = 0, idleTimer = 0, destroyed = false;
  const attributes = ['data-momentum-scroll', 'data-scroll-state', 'data-active-index'];
  const previous = attributes.map(name => container.getAttribute(name));
  const hasScrollEnd = 'onscrollend' in container;
  const hasSnapEvents = 'onscrollsnapchange' in container;
  const nativeSnap = typeof CSS !== 'undefined' && CSS.supports('scroll-snap-type', 'y mandatory');
  container.setAttribute('data-momentum-scroll', nativeSnap ? 'native' : 'free');
  container.setAttribute('data-scroll-state', 'idle');

  function commit(index) {
    if (destroyed || index < 0 || index >= items.length || index === active) return;
    active = index;
    container.setAttribute('data-active-index', String(index));
    onActiveChange({ index, item: items[index], count: items.length });
  }
  function readVisible() {
    readFrame = 0;
    if (destroyed) return;
    const top = container.getBoundingClientRect().top + container.clientTop;
    commit(predominantIndex(items.map(item => item.getBoundingClientRect()), top, container.clientHeight));
  }
  function scheduleRead() {
    if (!destroyed && !readFrame) readFrame = requestAnimationFrame(readVisible);
  }
  function settled() {
    if (destroyed) return;
    container.setAttribute('data-scroll-state', 'idle');
    scheduleRead();
  }
  function scrolling() {
    if (container.getAttribute('data-scroll-state') !== 'scrolling') container.setAttribute('data-scroll-state', 'scrolling');
    // Old-browser fallback is ONLY for read-only status/counter work, never for motion.
    if (!hasScrollEnd) { clearTimeout(idleTimer); idleTimer = setTimeout(settled, 180); }
  }
  function snapped(event) { commit(items.indexOf(event.snapTargetBlock)); }
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(scheduleRead, { root: container, threshold: [0, .5, 1] });
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleRead);
  function refresh() {
    if (destroyed) return;
    observer?.disconnect();
    items = [...container.querySelectorAll(itemSelector)]; active = -1;
    for (const item of items) observer?.observe(item);
    scheduleRead();
  }
  container.addEventListener('scroll', scrolling, { passive: true });
  if (hasScrollEnd) container.addEventListener('scrollend', settled, { passive: true });
  if (hasSnapEvents) container.addEventListener('scrollsnapchange', snapped, { passive: true });
  // No wheel/touch interception, velocity polling, scrollTop writes or second animation.
  resizeObserver?.observe(container);
  refresh();
  return {
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(readFrame); clearTimeout(idleTimer);
      observer?.disconnect(); resizeObserver?.disconnect();
      container.removeEventListener('scroll', scrolling);
      container.removeEventListener('scrollend', settled);
      container.removeEventListener('scrollsnapchange', snapped);
      attributes.forEach((name, index) => {
        if (previous[index] === null) container.removeAttribute(name);
        else container.setAttribute(name, previous[index]);
      });
    }
  };
}
