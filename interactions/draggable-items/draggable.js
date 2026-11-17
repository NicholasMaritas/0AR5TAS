// Standalone port of Oklama webpack module 9858's drag effect.
// Original source and adaptation notes are preserved in source-extract.json and usage.json.
export function enableDraggableItems(area, { persist = true, stateKey = 'oklama-draggable-test' } = {}) {
  const items = [...area.querySelectorAll('[data-drag]')];
  let active = null, selected = null, moved = false, z = 1;
  let startX = 0, startY = 0, originX = 0, originY = 0, x = 0, y = 0;
  const initial = items.map(item => [item.style.left, item.style.top]);
  const read = () => {
    try { const data = JSON.parse(localStorage.getItem(stateKey) || '{}'); return data && typeof data === 'object' ? data : {}; }
    catch { return {}; }
  };
  const saved = read()[location.pathname];
  if (persist && Array.isArray(saved)) items.forEach((item, i) => {
    const position = saved[i];
    if (Array.isArray(position) && position.length === 2 && position.every(Number.isFinite)) {
      item.style.left = 100 * position[0] + '%'; item.style.top = 100 * position[1] + '%';
    }
  });
  function point(event) {
    if (event.touches) return event.touches.length === 1 ? event.touches[0] : null;
    return event;
  }
  function down(event) {
    const p = point(event);
    if (!p) { active = null; moved = false; return; }
    if (selected) selected.style.outline = 'none';
    selected = event.target.closest?.('[data-drag]');
    if (!selected || !area.contains(selected)) { selected = null; return; }
    selected.style.outline = '2px dotted black';
    if (!event.touches && event.button !== 0) return;
    active = selected; moved = false;
    const rect = active.getBoundingClientRect(), bounds = area.getBoundingClientRect();
    startX = p.clientX; startY = p.clientY; originX = rect.left - bounds.left; originY = rect.top - bounds.top;
    active.style.zIndex = String(z++);
  }
  function move(event) {
    if (!active) return;
    const p = point(event); if (!p) return;
    const dx = p.clientX - startX, dy = p.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    moved = true; event.preventDefault();
    x = Math.min(area.offsetWidth, Math.max(0, originX + dx)) / area.offsetWidth;
    y = Math.min(area.offsetHeight, Math.max(0, originY + dy)) / area.offsetHeight;
    active.style.left = 100 * x + '%'; active.style.top = 100 * y + '%';
  }
  function finish(event) {
    if (event.touches?.length > 1) return;
    if (moved && active) {
      if (persist) {
        const index = Number(active.dataset.index), data = read();
        const positions = Array.isArray(data[location.pathname]) ? data[location.pathname] : [];
        positions[index] = [x, y]; data[location.pathname] = positions;
        try { localStorage.setItem(stateKey, JSON.stringify(data)); } catch {}
      }
      event.preventDefault();
    }
    active = null; moved = false;
  }
  function cancel() { active = null; moved = false; }
  const bindings = [['mousedown', down], ['touchstart', down], ['mousemove', move], ['touchmove', move, { passive: false }], ['click', finish, true], ['touchend', finish], ['touchcancel', cancel], ['blur', cancel]];
  for (const [type, fn, options] of bindings) window.addEventListener(type, fn, options);
  return {
    reset() {
      cancel();
      items.forEach((item, i) => { [item.style.left, item.style.top] = initial[i]; item.style.outline = ''; item.style.zIndex = ''; });
      selected = null; z = 1;
      const data = read(); delete data[location.pathname];
      try { localStorage.setItem(stateKey, JSON.stringify(data)); } catch {}
    },
    destroy() { cancel(); for (const [type, fn, options] of bindings) window.removeEventListener(type, fn, options); }
  };
}
