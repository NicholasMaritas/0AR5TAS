import {LoopMotion, rowOffset, rowOpacity} from './motion.js?v=1';
import {createSlidingTrigger} from './trigger-slide.js?v=4';

export function createLoopMenu(root) {
  const button = root.querySelector('.loop-toggle');
  const panel = root.querySelector('.loop-panel');
  const links = [...root.querySelectorAll('.loop-link')];
  const mobile = matchMedia('(max-width:767px), (hover:none) and (pointer:coarse) and (max-height:600px)');
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  const motion = new LoopMotion(links.length, {reduced:reduced.matches});
  let open = false, frameId = 0, previousTime = 0, pointer = null;
  let suppressClick = false, focusAtRest = false, destroyed = false;
  const stride = () => parseFloat(getComputedStyle(root).getPropertyValue('--row')) || 56;
  links.forEach(link => {
    link.setAttribute('aria-label', link.querySelector('.link-name').textContent);
    link.draggable = false;
  });
  function paint() {
    if (!mobile.matches) return;
    const height = stride();
    links.forEach((link, index) => {
      const offset = rowOffset(index, motion.position, links.length);
      link.style.transform = `translate3d(0,${offset * height}px,0)`;
      link.style.opacity = rowOpacity(offset);
      link.tabIndex = index === motion.index ? 0 : -1;
      link.toggleAttribute('data-centered', index === motion.index);
    });
    panel.dataset.centered = links[motion.index].querySelector('.link-name').textContent;
  }
  function stopFrames() { cancelAnimationFrame(frameId); frameId = 0; previousTime = 0; }
  function animate(now) {
    frameId = 0;
    if (!open || !mobile.matches || destroyed) return;
    const more = motion.frame(previousTime ? now - previousTime : 16, now);
    previousTime = now; paint();
    if (more) frameId = requestAnimationFrame(animate);
    else {
      previousTime = 0;
      if (focusAtRest) { links[motion.index].focus({preventScroll:true}); focusAtRest = false; }
    }
  }
  function startFrames() { if (!frameId) { previousTime = 0; frameId = requestAnimationFrame(animate); } }
  function releaseCapture() {
    const id = pointer?.id; pointer = null;
    if (id !== undefined && root.hasPointerCapture?.(id)) root.releasePointerCapture(id);
  }
  function setOpen(value, keyboard = false) {
    if (!mobile.matches) return;
    if (value) sliding.settle();
    else sliding.cancel();
    stopFrames(); releaseCapture(); motion.reset(); focusAtRest = false; suppressClick = false;
    open = value; root.dataset.open = String(open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    panel.hidden = !open;
    if (open) { paint(); if (keyboard) panel.focus({preventScroll:true}); }
  }
  const toggle = event => setOpen(!open, event.detail === 0);
  function down(event) {
    if (!open || !mobile.matches || pointer || event.isPrimary === false || event.button > 0) return;
    stopFrames(); motion.stop(); focusAtRest = false; suppressClick = false;
    pointer = {id:event.pointerId,startX:event.clientX,startY:event.clientY,lastY:event.clientY,
      lastTime:event.timeStamp,moved:false,scrolled:false};
  }
  function move(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!pointer.moved && Math.hypot(event.clientX-pointer.startX,event.clientY-pointer.startY) < 6) return;
    if (!pointer.moved) { pointer.moved = true; root.setPointerCapture?.(event.pointerId); }
    event.preventDefault();
    if (!pointer.scrolled && Math.abs(event.clientY-pointer.startY) < 5) return;
    pointer.scrolled = true;
    const delta = (event.clientY-pointer.lastY) / stride();
    if (!delta) return;
    const elapsed = Math.max(1,event.timeStamp-pointer.lastTime);
    const instantaneous = Math.max(-.055,Math.min(.055,delta/elapsed));
    motion.drag(delta,motion.velocity*.25+instantaneous*.75);
    pointer.lastY = event.clientY; pointer.lastTime = event.timeStamp;
    paint();
  }
  function up(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    move(event); // Include fast flicks whose travel arrives only on pointerup.
    const moved = pointer.moved, scrolled = pointer.scrolled;
    if (event.timeStamp-pointer.lastTime > 100) motion.velocity = 0;
    releaseCapture();
    if (moved) suppressClick = true;
    if (scrolled || Math.abs(motion.position-Math.round(motion.position)) > .001) {
      motion.release(); startFrames();
    }
  }
  function cancel(event) {
    if (!pointer || (event && event.pointerId !== pointer.id)) return;
    suppressClick ||= pointer.moved;
    releaseCapture(); motion.velocity = 0; motion.release(); startFrames();
  }
  function lostCapture(event) {
    // Touch starts with implicit capture on the touched child. Taking control
    // at the shared root releases that child and bubbles its loss through us.
    // Only losing our own capture ends the scroll gesture.
    if (event.target === root) cancel(event);
  }
  function click(event) {
    if (suppressClick && event.detail !== 0) {
      event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false;
    }
  }
  function wheel(event) {
    if (!open || !mobile.matches || event.ctrlKey) return;
    event.preventDefault(); event.stopPropagation();
    releaseCapture(); focusAtRest = false;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? panel.clientHeight : 1;
    motion.wheel(-event.deltaY * unit / stride(), performance.now());
    paint(); startFrames();
  }
  function key(event) {
    if (!mobile.matches) return;
    suppressClick = false;
    if (event.key === 'Escape' && open) {
      event.preventDefault(); setOpen(false); button.focus({preventScroll:true}); return;
    }
    if (!open) return;
    const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    if (direction || event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); releaseCapture(); stopFrames();
      if (direction) motion.choose(direction);
      else {
        const index = event.key === 'Home' ? 0 : links.length - 1;
        motion.target = Math.round((motion.position - index) / links.length) * links.length + index;
        motion.mode = 'snap';
        if (motion.reduced) motion.settleImmediately(motion.target);
      }
      focusAtRest = true; paint(); startFrames();
    } else if (event.key === 'Enter' && event.target === panel) {
      event.preventDefault(); links[motion.index].click();
    }
  }
  function layout() {
    const focusWasInPanel = panel.contains(document.activeElement);
    const focusWasOnButton = document.activeElement === button;
    sliding.settle();
    stopFrames(); releaseCapture(); motion.reset(); open = false; focusAtRest = false;
    root.dataset.open = 'false'; button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-label','Open navigation');
    panel.hidden = mobile.matches;
    if (mobile.matches) {
      panel.setAttribute('aria-describedby','loop-help'); paint();
      if (focusWasInPanel) button.focus({preventScroll:true});
    } else {
      panel.removeAttribute('aria-describedby'); panel.removeAttribute('data-centered');
      links.forEach(link => { link.style.transform = ''; link.style.opacity = ''; link.tabIndex = 0; link.removeAttribute('data-centered'); });
      if (focusWasOnButton) links[0].focus({preventScroll:true});
    }
  }
  function preference() {
    motion.reduced = reduced.matches;
    if (reduced.matches) { stopFrames(); motion.settleImmediately(); paint(); }
  }
  function resized() {
    if (!mobile.matches) return;
    suppressClick ||= Boolean(pointer?.moved);
    releaseCapture(); stopFrames(); motion.settleImmediately(); paint();
  }
  function visibility() { if (document.hidden && mobile.matches) setOpen(false); }
  const sliding = createSlidingTrigger(root, button, {
    isEnabled:() => mobile.matches, isOpen:() => open
  });
  const listeners = [
    [button,'click',toggle], [root,'pointerdown',down], [root,'pointermove',move,{passive:false}],
    [root,'pointerup',up], [root,'pointercancel',cancel], [root,'lostpointercapture',lostCapture], [root,'click',click,true],
    [root,'wheel',wheel,{passive:false}], [root,'keydown',key], [document,'visibilitychange',visibility], [window,'resize',resized]
  ];
  listeners.forEach(([target,name,handler,options]) => target.addEventListener(name,handler,options));
  mobile.addEventListener('change',layout); reduced.addEventListener('change',preference);
  layout();
  return {destroy() {
    destroyed = true; stopFrames(); releaseCapture();
    sliding.destroy();
    listeners.forEach(([target,name,handler,options]) => target.removeEventListener(name,handler,options));
    mobile.removeEventListener('change',layout); reduced.removeEventListener('change',preference);
  }};
}

const navigation = document.querySelector('.loop-nav');
if (navigation) createLoopMenu(navigation);



