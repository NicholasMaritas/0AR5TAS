/** Isolate the original Tlog document from Testing's styles, history and music. */
export function createPhotoSection(root, {onHome, returnFocus}) {
  const doc = root.ownerDocument;
  const section = doc.createElement('section');
  section.className = 'testing-photos';
  section.setAttribute('aria-label', 'Photo library');
  section.setAttribute('aria-hidden', 'true');
  const status = doc.createElement('p');
  status.className = 'photo-loading';
  status.setAttribute('role', 'status');
  section.append(status);
  root.append(section);
  let active = false, ready = false, destroyed = false, frame = null, unbind = () => {};
  const source = new URL('../interactions/tlog-photo-library/?embed=testing', doc.baseURI).href;
  function pauseMedia() {
    frame?.contentDocument?.querySelectorAll('video,audio').forEach(media => media.pause());
  }
  function availability() {
    if (!frame) return;
    frame.inert = !active || !ready;
    frame.style.pointerEvents = active && ready ? 'auto' : 'none';
  }
  function loaded() {
    if (destroyed) return;
    unbind();
    const child = frame.contentDocument;
    ready = Boolean(child?.getElementById('Tlog'));
    status.textContent = ready ? '' : 'Photo library could not load. Select Six to retry.';
    status.hidden = ready;
    if (ready) {
      const home = event => {
        if (!event.target.closest?.('#TlHome')) return;
        event.preventDefault(); event.stopImmediatePropagation(); onHome();
      };
      const play = event => { if (!active) event.target.pause?.(); };
      child.addEventListener('click', home, true);
      child.addEventListener('play', play, true);
      unbind = () => {
        child.removeEventListener('click', home, true);
        child.removeEventListener('play', play, true);
      };
    }
    availability();
    if (!active) pauseMedia();
  }
  function setActive(value) {
    if (destroyed) return;
    active = value;
    if (!active && doc.activeElement === frame) returnFocus();
    section.toggleAttribute('data-active', active);
    section.setAttribute('aria-hidden', String(!active));
    root.dataset.photosActive = String(active);
    if (active && !frame) {
      status.hidden = false; status.textContent = 'Loading photo library…';
      frame = doc.createElement('iframe');
      frame.title = 'Tlog photo library';
      frame.setAttribute('allow', 'clipboard-write; web-share');
      frame.inert = true;
      frame.addEventListener('load', loaded);
      frame.src = source;
      section.append(frame);
    } else if (active && !ready) {
      status.hidden = false; status.textContent = 'Loading photo library…';
      frame.src = source;
    }
    availability();
    if (!active) pauseMedia();
  }
  return {setActive, destroy() {
    if (destroyed) return;
    destroyed = true; pauseMedia(); unbind();
    frame?.removeEventListener('load', loaded);
    section.remove();
  }};
}
