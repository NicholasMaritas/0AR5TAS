export function releaseSide(left, right, position, velocity = 0) {
  return position + velocity * 140 < (left + right) / 2 ? 'left' : 'right';
}

// Owns only the closed trigger's horizontal gesture. The menu keeps its own
// vertical scrolling controller and is never dragged by this helper.
export function createSlidingTrigger(root, button, {isEnabled, isOpen}) {
  let gesture = null, suppressClick = false;
  root.dataset.triggerSide ||= 'right';
  function releaseCapture() {
    const id = gesture?.id;
    gesture = null;
    if (id !== undefined && button.hasPointerCapture?.(id)) button.releasePointerCapture(id);
  }
  function settle() {
    releaseCapture();
    root.dataset.triggerDragging = 'true';
    button.style.removeProperty('--trigger-offset');
    button.getBoundingClientRect(); // Commit the resting edge without animation.
    delete root.dataset.triggerDragging;
  }
  function freeze() {
    const current = button.getBoundingClientRect().left;
    const side = root.dataset.triggerSide;
    root.dataset.triggerDragging = 'true';
    button.style.removeProperty('--trigger-offset');
    // Measure the actual CSS safe-area endpoints once, before the next paint.
    // The menu is closed, so its mirrored layout is not exposed while measuring.
    root.dataset.triggerSide = 'left';
    const left = button.getBoundingClientRect().left;
    root.dataset.triggerSide = 'right';
    const right = button.getBoundingClientRect().left;
    root.dataset.triggerSide = side;
    button.style.setProperty('--trigger-offset', `${current - left}px`);
    return {left, right, current};
  }
  function finish(side, animate = true) {
    root.dataset.triggerSide = side;
    releaseCapture();
    if (!animate) { settle(); return; }
    delete root.dataset.triggerDragging;
    button.getBoundingClientRect(); // Preserve the last dragged position as the transition start.
    button.style.removeProperty('--trigger-offset');
  }
  function down(event) {
    if (!isEnabled() || event.isPrimary === false || event.button > 0) return;
    suppressClick = false;
    const locked = isOpen();
    const bounds = locked ? null : freeze();
    gesture = {id:event.pointerId, side:root.dataset.triggerSide, locked, bounds,
      x:event.clientX, y:event.clientY, lastX:event.clientX, lastTime:event.timeStamp,
      position:bounds?.current, moved:false, horizontal:false, velocity:0};
    button.setPointerCapture?.(event.pointerId);
  }
  function move(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      gesture.moved = true; gesture.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (gesture.locked || !gesture.horizontal) return;
    event.preventDefault();
    const elapsed = Math.max(1, event.timeStamp - gesture.lastTime);
    const velocity = Math.max(-3, Math.min(3, (event.clientX - gesture.lastX) / elapsed));
    gesture.velocity = gesture.velocity * .25 + velocity * .75;
    gesture.lastX = event.clientX; gesture.lastTime = event.timeStamp;
    const {left, right, current} = gesture.bounds;
    gesture.position = Math.max(left, Math.min(right, current + dx));
    button.style.setProperty('--trigger-offset', `${gesture.position - left}px`);
  }
  function up(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    suppressClick = gesture.moved;
    if (gesture.locked) { releaseCapture(); return; }
    const velocity = event.timeStamp - gesture.lastTime > 100 ? 0 : gesture.velocity;
    const side = gesture.moved && gesture.horizontal
      ? releaseSide(gesture.bounds.left, gesture.bounds.right, gesture.position, velocity)
      : gesture.side;
    finish(side);
  }
  function cancel() {
    if (!gesture) return;
    const {locked, moved, side} = gesture;
    suppressClick = moved;
    if (locked) releaseCapture();
    else finish(side);
  }
  function click(event) {
    if (suppressClick && event.detail !== 0) {
      event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false;
    }
  }
  function key(event) {
    suppressClick = false;
    if (!isEnabled() || isOpen()) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const side = event.key === 'ArrowLeft' ? 'left' : 'right';
      if (gesture) cancel();
      freeze(); finish(side);
    } else if (event.key === 'Escape') cancel();
  }
  function resized() { if (isEnabled()) settle(); else { releaseCapture(); button.style.removeProperty('--trigger-offset'); delete root.dataset.triggerDragging; } }
  const listeners = [[button,'pointerdown',down], [button,'pointermove',move,{passive:false}],
    [button,'pointerup',up], [button,'pointercancel',cancel], [button,'lostpointercapture',cancel],
    [button,'click',click,true], [button,'keydown',key], [window,'resize',resized]];
  listeners.forEach(([target,name,handler,options]) => target.addEventListener(name,handler,options));
  return {settle, cancel, destroy() {
    settle();
    listeners.forEach(([target,name,handler,options]) => target.removeEventListener(name,handler,options));
  }};
}
