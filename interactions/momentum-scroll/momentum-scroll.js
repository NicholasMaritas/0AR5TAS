// Native momentum, followed by a velocity-matched, critically damped alignment.
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

export function alignmentTarget(rect, viewportTop, viewportHeight, scrollTop, maxScroll) {
  let delta = rect.top - viewportTop;
  // A tall item already covering the viewport must remain freely readable.
  if (rect.height > viewportHeight + 1) {
    if (rect.top <= viewportTop && rect.bottom >= viewportTop + viewportHeight) delta = 0;
    else if (rect.bottom < viewportTop + viewportHeight) delta = rect.bottom - viewportTop - viewportHeight;
  }
  return Math.max(0, Math.min(maxScroll, scrollTop + delta));
}

export function springPosition(start, target, velocity, seconds, frequency = 12) {
  const displacement = start - target;
  return target + (displacement + (velocity + frequency * displacement) * seconds) * Math.exp(-frequency * seconds);
}

export function createMomentumScroll(container, { itemSelector = '[data-scroll-item]', settleSpeed = 40, settleWindow = 100, inputQuiet = 160, frequency = 12 } = {}) {
  const items = [...container.querySelectorAll(itemSelector)];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const previousState = container.getAttribute('data-momentum-scroll');
  container.setAttribute('data-momentum-scroll', 'ready');
  let monitorFrame = 0, snapFrame = 0, destroyed = false;
  let touches = 0, pressed = false, velocity = 0;
  let lastTop = container.scrollTop, lastTime = performance.now();
  let lastInput = -Infinity, quietSince = null;

  function bounds() {
    return { top: container.getBoundingClientRect().top + container.clientTop, height: container.clientHeight };
  }
  function cancelSnap() {
    cancelAnimationFrame(snapFrame); snapFrame = 0;
    if (!destroyed) container.setAttribute('data-momentum-scroll', 'ready');
  }
  function startMonitor() {
    if (destroyed || monitorFrame || snapFrame) return;
    lastTop = container.scrollTop; lastTime = performance.now(); quietSince = null;
    monitorFrame = requestAnimationFrame(monitor);
  }
  function align(initialVelocity = velocity) {
    if (destroyed || touches || pressed) return;
    const view = bounds();
    const rects = items.map(item => item.getBoundingClientRect());
    const index = predominantIndex(rects, view.top, view.height);
    if (index < 0) return;
    const start = container.scrollTop;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const target = alignmentTarget(rects[index], view.top, view.height, start, maxScroll);
    if (Math.abs(target - start) < .5) return;
    if (reducedMotion.matches) { container.scrollTop = target; return; }
    // Never exceed the low native handoff velocity; no synthetic fling is added.
    const handoffVelocity = Math.max(-settleSpeed, Math.min(settleSpeed, initialVelocity));
    const started = performance.now();
    container.setAttribute('data-momentum-scroll', 'snapping');
    function frame(now) {
      if (destroyed) return;
      const elapsed = (now - started) / 1000;
      const next = Math.max(0, Math.min(maxScroll, springPosition(start, target, handoffVelocity, elapsed, frequency)));
      container.scrollTop = next;
      if (elapsed >= 1.25 || (elapsed > .18 && Math.abs(next - target) < .25)) {
        container.scrollTop = target; snapFrame = 0; velocity = 0;
        container.setAttribute('data-momentum-scroll', 'ready');
      } else snapFrame = requestAnimationFrame(frame);
    }
    snapFrame = requestAnimationFrame(frame);
  }
  function monitor(now) {
    monitorFrame = 0;
    if (destroyed || snapFrame) return;
    const dt = Math.max(1, now - lastTime);
    const top = container.scrollTop;
    const measured = (top - lastTop) * 1000 / dt;
    velocity = measured * .65 + velocity * .35;
    lastTop = top; lastTime = now;
    if (touches || pressed || now - lastInput < inputQuiet || Math.abs(velocity) > settleSpeed) quietSince = null;
    else if (quietSince === null) quietSince = now;
    if (quietSince !== null && now - quietSince >= settleWindow) { align(velocity); return; }
    monitorFrame = requestAnimationFrame(monitor);
  }
  function input() {
    cancelSnap(); lastInput = performance.now(); quietSince = null;
    // Native scrolling remains untouched: no preventDefault, transforms, or wheel delta multiplier.
    startMonitor();
  }
  function onScroll() { if (!snapFrame) startMonitor(); }
  function touchStart(event) { touches = event.touches.length; input(); }
  function touchEnd(event) { touches = event.touches.length; input(); }
  function pointerDown(event) { if (event.pointerType !== 'touch') { pressed = true; input(); } }
  function pointerUp(event) { if (event.pointerType !== 'touch' && pressed) { pressed = false; input(); } }
  function keyDown(event) {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) input();
  }
  function blur() { touches = 0; pressed = false; cancelSnap(); }
  const listeners = [
    [container, 'scroll', onScroll], [container, 'scrollend', onScroll],
    [container, 'wheel', input], [container, 'touchstart', touchStart],
    [container, 'touchend', touchEnd], [container, 'touchcancel', touchEnd],
    [container, 'pointerdown', pointerDown], [window, 'pointerup', pointerUp],
    [window, 'pointercancel', pointerUp], [container, 'keydown', keyDown], [window, 'blur', blur]
  ];
  for (const [target, name, handler] of listeners) target.addEventListener(name, handler, { passive: true });
  const resizeObserver = new ResizeObserver(() => { cancelSnap(); velocity = 0; startMonitor(); });
  resizeObserver.observe(container);
  return {
    refresh() { items.splice(0, items.length, ...container.querySelectorAll(itemSelector)); cancelSnap(); startMonitor(); },
    destroy() {
      destroyed = true; cancelAnimationFrame(monitorFrame); cancelAnimationFrame(snapFrame); resizeObserver.disconnect();
      for (const [target, name, handler] of listeners) target.removeEventListener(name, handler);
      if (previousState === null) container.removeAttribute('data-momentum-scroll');
      else container.setAttribute('data-momentum-scroll', previousState);
    }
  };
}
