export function flickSide(side, inwardTravel) {
  return inwardTravel >= 12 ? (side === 'right' ? 'left' : 'right') : side;
}

export function flickDock(dock, upwardTravel, downwardTravel = 0) {
  const levels = ['bottom','middle','top'];
  const index = levels.indexOf(dock);
  // Advance one resting level per deliberate flick. At the outer levels,
  // travel away from the other levels cannot undo a qualified inward flick.
  if (dock === 'bottom') return upwardTravel >= 24 ? 'middle' : 'bottom';
  if (dock === 'top') return downwardTravel >= 24 ? 'middle' : 'top';
  const direction = upwardTravel >= 24 && upwardTravel >= downwardTravel ? 1 : downwardTravel >= 24 ? -1 : 0;
  return levels[index + direction];
}

// Closed gestures own docking. Open gestures belong entirely to the menu's
// shared scroll band, including gestures that start on the outlined trigger.
export function createSlidingTrigger(root, button, {isEnabled, isOpen}) {
  let gesture = null, suppressClick = false, settling = null;
  const landscape = matchMedia('(orientation:landscape)');
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  root.dataset.triggerSide ||= 'right';
  root.dataset.triggerDock ||= 'bottom';
  function stopSettling() {
    if (settling) { settling.cancel(); settling = null; }
  }
  function normalizeDock() {
    if (landscape.matches) root.dataset.triggerDock = 'bottom';
  }
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
    if (gesture) suppressClick = true;
    releaseCapture(); stopSettling(); normalizeDock();
    root.dataset.triggerDragging = 'true';
    clearPosition();
    button.getBoundingClientRect();
    delete root.dataset.triggerDragging;
  }
  function freeze() {
    const current = button.getBoundingClientRect();
    stopSettling(); normalizeDock();
    const side = root.dataset.triggerSide, dock = root.dataset.triggerDock;
    root.dataset.triggerDragging = 'true'; clearPosition();
    const targets = [];
    for (const edge of ['left','right']) for (const level of (landscape.matches ? ['bottom'] : ['bottom','middle','top'])) {
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
  function finish(side, dock, axis = 'x') {
    const current = button.getBoundingClientRect();
    stopSettling();
    root.dataset.triggerSide = side;
    root.dataset.triggerDock = landscape.matches ? 'bottom' : dock;
    releaseCapture();
    // Measure the resting endpoint with transitions off. If a new gesture
    // interrupted a different-axis glide, settle in two straight segments.
    root.dataset.triggerDragging = 'true'; clearPosition();
    const target = button.getBoundingClientRect();
    const dx = Math.abs(target.left-current.left), dy = Math.abs(target.top-current.top);
    if (dx > .01 && dy > .01) {
      if (reduced.matches || !button.animate) { delete root.dataset.triggerDragging; return; }
      const middle = axis === 'y' ? {x:current.left,y:target.top} : {x:target.left,y:current.top};
      const first = axis === 'y' ? dy : dx;
      const offset = Math.max(.15,Math.min(.85,first/(dx+dy)));
      const transform = (x,y) => `translate3d(${x}px,${y}px,0)`;
      settling = button.animate([
        {transform:transform(current.left,current.top),offset:0,easing:'cubic-bezier(.4,0,.2,1)'},
        {transform:transform(middle.x,middle.y),offset,easing:'cubic-bezier(.4,0,.2,1)'},
        {transform:transform(target.left,target.top),offset:1}
      ],{duration:360,easing:'linear'});
      const animation = settling;
      animation.onfinish = () => { if (settling === animation) settling = null; };
      delete root.dataset.triggerDragging;
      return;
    }
    button.style.setProperty('--trigger-x', `${current.left}px`);
    button.style.setProperty('--trigger-y', `${current.top}px`);
    button.getBoundingClientRect();
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
      bounds,x:event.clientX,y:event.clientY,moved:false,axis:null,inwardTravel:0,upwardTravel:0,downwardTravel:0};
    button.setPointerCapture?.(event.pointerId);
  }
  function sample(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (Math.hypot(dx,dy) >= 6) gesture.moved = true;
    if (!gesture.moved) return;
    // Pick one dominant axis after tap slop; never switch it during a gesture.
    // Cross-axis finger movement cannot affect either the preview or the dock.
    gesture.axis ||= Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    const b = gesture.bounds;
    if (gesture.axis === 'x') {
      gesture.inwardTravel = Math.max(gesture.inwardTravel,gesture.side === 'right' ? -dx : dx);
      button.style.setProperty('--trigger-x', `${Math.max(b.left,Math.min(b.right,b.x+dx))}px`);
      button.style.setProperty('--trigger-y', `${b.y}px`);
    } else if (!landscape.matches) {
      gesture.upwardTravel = Math.max(gesture.upwardTravel,-dy);
      gesture.downwardTravel = Math.max(gesture.downwardTravel,dy);
      button.style.setProperty('--trigger-x', `${b.x}px`);
      button.style.setProperty('--trigger-y', `${Math.max(b.top,Math.min(b.bottom,b.y+dy))}px`);
    }
  }

  function move(event) { sample(event); if (gesture?.moved) event.preventDefault(); }
  function up(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    sample(event); suppressClick = gesture.moved;
    finish(flickSide(gesture.side,gesture.inwardTravel),flickDock(gesture.dock,gesture.upwardTravel,gesture.downwardTravel),gesture.axis || 'x');
  }
  function cancel(event) {
    if (!gesture || (event && event.pointerId !== gesture.id)) return;
    const {moved,side,dock,axis} = gesture; suppressClick = moved; finish(side,dock,axis || 'x');
  }
  function lostCapture(event) {
    // A touch on the inner dot may transfer implicit child capture to us.
    if (event.target === button) cancel(event);
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
      event.preventDefault();
      if (landscape.matches && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) return;
      if (gesture) cancel(); freeze();
      finish(event.key === 'ArrowLeft' ? 'left' : event.key === 'ArrowRight' ? 'right' : root.dataset.triggerSide,
        event.key === 'ArrowUp' ? flickDock(root.dataset.triggerDock,24,0) : event.key === 'ArrowDown' ? flickDock(root.dataset.triggerDock,0,24) : root.dataset.triggerDock,
        event.key === 'ArrowUp' || event.key === 'ArrowDown' ? 'y' : 'x');
    } else if (event.key === 'Escape') cancel();
  }
  function resized() {
    if (isEnabled()) settle();
    else { releaseCapture(); stopSettling(); normalizeDock(); clearPosition(); delete root.dataset.triggerDragging; }
  }
  function preference() { if (reduced.matches) settle(); }
  const listeners = [[button,'pointerdown',down], [button,'pointermove',move,{passive:false}],
    [button,'pointerup',up], [button,'pointercancel',cancel], [button,'lostpointercapture',lostCapture],
    [button,'click',click,true], [button,'keydown',key], [window,'resize',resized]];
  listeners.forEach(([target,name,handler,options]) => target.addEventListener(name,handler,options));
  landscape.addEventListener('change',resized);
  reduced.addEventListener('change',preference);
  normalizeDock();
  return {settle,cancel,destroy() {
    settle(); landscape.removeEventListener('change',resized);
    reduced.removeEventListener('change',preference);
    listeners.forEach(([target,name,handler,options]) => target.removeEventListener(name,handler,options));
  }};
}
