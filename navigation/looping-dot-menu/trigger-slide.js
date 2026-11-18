export function flickSide(side, inwardTravel) {
  return inwardTravel >= 12 ? (side === 'right' ? 'left' : 'right') : side;
}

export function flickDock(dock, towardTravel) {
  return towardTravel >= 24 ? (dock === 'middle' ? 'bottom' : 'middle') : dock;
}

// Closed gestures own docking. Open gestures belong entirely to the menu's
// shared scroll band, including gestures that start on the outlined trigger.
export function createSlidingTrigger(root, button, {isEnabled, isOpen}) {
  let gesture = null, suppressClick = false;
  root.dataset.triggerSide ||= 'right';
  root.dataset.triggerDock ||= 'bottom';
  function releaseCapture() {
    const id = gesture?.id;
    gesture = null;
    if (id !== undefined && button.hasPointerCapture?.(id)) button.releasePointerCapture(id);
  }
  function clearPosition() {
    button.style.removeProperty('--trigger-x');
    button.style.removeProperty('--trigger-y');
  }
  function settle() {
    if (gesture?.moved) suppressClick = true;
    releaseCapture();
    root.dataset.triggerDragging = 'true';
    clearPosition();
    button.getBoundingClientRect();
    delete root.dataset.triggerDragging;
  }
  function freeze() {
    const current = button.getBoundingClientRect();
    const side = root.dataset.triggerSide, dock = root.dataset.triggerDock;
    root.dataset.triggerDragging = 'true'; clearPosition();
    const targets = [];
    for (const edge of ['left','right']) for (const level of ['bottom','middle']) {
      root.dataset.triggerSide = edge; root.dataset.triggerDock = level;
      const {left,top} = button.getBoundingClientRect(); targets.push({left,top});
    }
    root.dataset.triggerSide = side; root.dataset.triggerDock = dock;
    button.style.setProperty('--trigger-x', `${current.left}px`);
    button.style.setProperty('--trigger-y', `${current.top}px`);
    return {x:current.left,y:current.top,
      left:Math.min(...targets.map(t=>t.left)),right:Math.max(...targets.map(t=>t.left)),
      top:Math.min(...targets.map(t=>t.top)),bottom:Math.max(...targets.map(t=>t.top))};
  }
  function finish(side, dock, animate = true) {
    root.dataset.triggerSide = side; root.dataset.triggerDock = dock;
    releaseCapture();
    if (!animate) { settle(); return; }
    delete root.dataset.triggerDragging;
    button.getBoundingClientRect();
    clearPosition();
  }
  function down(event) {
    if (!isEnabled() || gesture || event.isPrimary === false || event.button > 0) return;
    suppressClick = false;
    if (isOpen()) return;
    const bounds = freeze();
    gesture = {id:event.pointerId,side:root.dataset.triggerSide,dock:root.dataset.triggerDock,
      bounds,x:event.clientX,y:event.clientY,moved:false,inwardTravel:0,towardTravel:0};
    button.setPointerCapture?.(event.pointerId);
  }
  function sample(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (Math.hypot(dx,dy) >= 6) gesture.moved = true;
    if (!gesture.moved) return;
    // Independent, latched intent allows curved/diagonal flicks without a
    // straight-line or release-speed requirement. Final pointerup is sampled.
    gesture.inwardTravel = Math.max(gesture.inwardTravel, gesture.side === 'right' ? -dx : dx);
    gesture.towardTravel = Math.max(gesture.towardTravel, gesture.dock === 'bottom' ? -dy : dy);
    const b = gesture.bounds;
    button.style.setProperty('--trigger-x', `${Math.max(b.left,Math.min(b.right,b.x+dx))}px`);
    button.style.setProperty('--trigger-y', `${Math.max(b.top,Math.min(b.bottom,b.y+dy))}px`);
  }
  function move(event) { sample(event); if (gesture?.moved) event.preventDefault(); }
  function up(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    sample(event); suppressClick = gesture.moved;
    finish(flickSide(gesture.side,gesture.inwardTravel),flickDock(gesture.dock,gesture.towardTravel));
  }
  function cancel(event) {
    if (!gesture || (event && event.pointerId !== gesture.id)) return;
    const {moved,side,dock} = gesture; suppressClick = moved; finish(side,dock);
  }
  function click(event) {
    if (suppressClick && event.detail !== 0) {
      event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false;
    }
  }
  function key(event) {
    suppressClick = false;
    if (!isEnabled() || isOpen()) return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault(); if (gesture) cancel(); freeze();
      finish(event.key === 'ArrowLeft' ? 'left' : event.key === 'ArrowRight' ? 'right' : root.dataset.triggerSide,
        event.key === 'ArrowUp' ? 'middle' : event.key === 'ArrowDown' ? 'bottom' : root.dataset.triggerDock);
    } else if (event.key === 'Escape') cancel();
  }
  function resized() {
    if (isEnabled()) settle();
    else { releaseCapture(); clearPosition(); delete root.dataset.triggerDragging; }
  }
  const listeners = [[button,'pointerdown',down], [button,'pointermove',move,{passive:false}],
    [button,'pointerup',up], [button,'pointercancel',cancel], [button,'lostpointercapture',cancel],
    [button,'click',click,true], [button,'keydown',key], [window,'resize',resized]];
  listeners.forEach(([target,name,handler,options]) => target.addEventListener(name,handler,options));
  return {settle,cancel,destroy() {
    settle(); listeners.forEach(([target,name,handler,options]) => target.removeEventListener(name,handler,options));
  }};
}
