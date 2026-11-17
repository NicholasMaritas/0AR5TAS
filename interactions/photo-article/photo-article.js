/* A stationary article is uncovered by a moving, cropped copy of the photo.
   Native feed momentum is untouched; this controller only owns the dialog. */
const EASING = 'cubic-bezier(.65, 0, .35, 1)';
const rectFrame = rect => ({left: `${rect.left}px`, top: `${rect.top}px`,
  width: `${rect.width}px`, height: `${rect.height}px`});

export function createPhotoArticle(feed, {onOpen = () => {}, onClose = () => {}} = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'photo-article';
  dialog.setAttribute('aria-labelledby', 'article-title');
  dialog.innerHTML = `
    <div class="article-scroll" tabindex="0" aria-label="Photo article">
      <header class="article-header"><span data-article-series></span></header>
      <article class="article-page">
        <p class="article-breadcrumb"><span data-article-series></span> &gt; <span data-article-name></span></p>
        <div class="article-hero">
          <div class="article-intro">
            <p class="article-kicker">Photo study</p>
            <h1 id="article-title"></h1>
            <p data-article-description></p>
            <p class="article-sample">Sample article</p>
          </div>
          <figure class="article-image"><img alt="" decoding="async" draggable="false"><figcaption data-article-caption></figcaption></figure>
        </div>
        <div class="article-body">
          <p>This is sample text for the photo study. It provides a place to pause with the image, look more closely, and continue reading beyond the full-screen view.</p>
          <p>The photograph now sits beside the introduction. The page continues below it, leaving space for a longer story, notes, or an account of how the image was made.</p>
          <h2>A closer look</h2>
          <p>Look at the relationship between light and shadow, the edges of the frame, and the smaller details that become visible with time. A full-screen image offers one view; returning to it after reading can offer another.</p>
          <p>This sample article uses the same photograph throughout. The words are placeholders for human testing; no location, date, photographer, or story has been attributed to it.</p>
          <h2>Back to the photograph</h2>
          <p>Close the article with the X in the top right to return to the same photograph and continue through the photo studies.</p>
        </div>
      </article>
    </div>
    <button class="article-close" type="button" aria-label="Close article"><span aria-hidden="true">×</span></button>
    <div class="photo-flight" aria-hidden="true" hidden><img alt="" draggable="false"></div>`;
  document.body.append(dialog);
  // Prepare the article font before the first click, avoiding a layout shift in flight.
  document.fonts?.load('14px "Geist Mono"').catch(() => {});
  const scroller = dialog.querySelector('.article-scroll');
  const hero = dialog.querySelector('.article-image img');
  const flight = dialog.querySelector('.photo-flight');
  const flyingImage = flight.querySelector('img');
  const shade = document.createElement('div');
  shade.className = 'photo-flight-shade';
  flight.append(shade);
  const closeButton = dialog.querySelector('.article-close');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let state = 'closed', animation = null, generation = 0;
  let source = null, trigger = null, savedTop = 0, savedOverflow = '';
  let ghost = null, ghostAnimation = null, shadeAnimation = null, destroyed = false;
  const setState = value => { state = value; dialog.dataset.articleState = value; };
  const viewport = () => ({left: 0, top: 0, width: dialog.clientWidth, height: dialog.clientHeight});
  const removeGhost = () => { ghostAnimation?.cancel(); ghostAnimation = null; ghost?.remove(); ghost = null; };
  function finishClose() {
    flight.hidden = true;
    hero.style.visibility = '';
    removeGhost();
    dialog.close();
    feed.style.overflowY = savedOverflow;
    feed.inert = false;
    // No scroll write in the normal path: feed never moved while the dialog was open.
    // Resize may change native snap geometry; return to the same photo in that case.
    if (Math.abs(feed.scrollTop - savedTop) > 1 || Math.abs(source.offsetTop - savedTop) > 1)
      feed.scrollTop = source.offsetTop;
    setState('closed');
    onClose();
    // A caption may still be waiting to fade in; hidden buttons cannot receive
    // browser focus. Return keyboard control to the feed during that pause.
    const focusTarget = trigger && getComputedStyle(trigger).visibility !== 'hidden' ? trigger : feed;
    focusTarget.focus({preventScroll: true});
  }
  async function move(to, opening, duration) {
    const ticket = ++generation;
    const from = flight.getBoundingClientRect();
    const shadeFrom = getComputedStyle(shade).opacity;
    shadeAnimation?.cancel();
    animation?.cancel();
    Object.assign(flight.style, rectFrame(from));
    setState(opening ? 'opening' : 'closing');
    scroller.style.overflowY = 'hidden';
    const finalFrame = rectFrame(to);
    const shadeTo = opening ? '0' : '1';
    shade.style.opacity = shadeTo;
    if (!reduced.matches && flight.animate) {
      shadeAnimation = shade.animate([{opacity: shadeFrom}, {opacity: shadeTo}], {duration, easing: EASING, fill: 'both'});
      shadeAnimation.finished.catch(() => {});
      animation = flight.animate([rectFrame(from), finalFrame], {duration, easing: EASING, fill: 'both'});
      try { await animation.finished; } catch { return; }
    }
    if (destroyed || ticket !== generation) return;
    Object.assign(flight.style, finalFrame);
    shadeAnimation?.cancel(); shadeAnimation = null;
    animation?.cancel(); animation = null;
    if (opening) {
      hero.style.visibility = '';
      flight.hidden = true;
      removeGhost();
      setState('open');
      scroller.style.overflowY = 'auto';
    } else finishClose();
  }
  function close() {
    if (state === 'closed' || state === 'closing') return;
    if (state === 'preparing') { ++generation; setState('closed'); return; }
    removeGhost();
    if (state === 'open') {
      shade.style.opacity = '0';
      // The reverse starts at the image's actual location, including article scroll.
      Object.assign(flight.style, rectFrame(hero.getBoundingClientRect()));
      flight.hidden = false;
      hero.style.visibility = 'hidden';
    }
    move(viewport(), false, state === 'opening' ? 650 : 1000);
  }
  async function open(item, button) {
    if (state !== 'closed') return;
    const image = item.querySelector('img');
    if (!image?.complete || !image.naturalWidth) return;
    source = item; trigger = button; savedTop = feed.scrollTop;
    savedOverflow = feed.style.overflowY;
    const title = item.querySelector('h1,h2').textContent;
    const series = item.querySelector('small').textContent;
    dialog.querySelector('#article-title').textContent = title;
    dialog.querySelectorAll('[data-article-series]').forEach(el => { el.textContent = series; });
    dialog.querySelector('[data-article-name]').textContent = title;
    dialog.querySelector('[data-article-description]').textContent = image.alt + '.';
    dialog.querySelector('[data-article-caption]').textContent = title + ' / ' + series;
    for (const copy of [hero, flyingImage]) {
      // Reuse the already-loaded candidate to avoid a decode/crop swap in flight.
      copy.removeAttribute('srcset'); copy.src = image.currentSrc || image.src;
      copy.style.objectPosition = getComputedStyle(image).objectPosition;
    }
    hero.alt = image.alt;
    // Keep the original feed visible while both copies decode. A cached URL alone
    // does not guarantee a newly-created image can be painted in the first frame.
    setState('preparing');
    const prepared = ++generation;
    await Promise.all([
      hero.decode?.().catch(() => {}),
      flyingImage.decode?.().catch(() => {}),
      document.fonts?.load('14px "Geist Mono"').catch(() => {})
    ]);
    if (destroyed || prepared !== generation) return;
    if ([hero, flyingImage].some(copy => copy.complete && copy.naturalWidth === 0)) {
      setState('closed'); return;
    }
    if (Math.abs(feed.scrollTop - savedTop) > 1 || Math.abs(source.offsetTop - savedTop) > 1) {
      setState('closed'); return;
    }
    // Layout and typography reach their final state before the cover moves.
    dialog.showModal();
    scroller.scrollTop = 0;
    feed.inert = true;
    feed.style.overflowY = 'hidden';
    Object.assign(flight.style, rectFrame(viewport()));
    flight.hidden = false;
    shade.style.opacity = '1';
    hero.style.visibility = 'hidden';
    // Preserve the visible caption briefly, then let it dissolve over the photo.
    const caption = item.querySelector('figcaption');
    ghost = caption.cloneNode(true);
    ghost.className = 'article-caption-ghost';
    ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
    const captionRect = caption.getBoundingClientRect();
    Object.assign(ghost.style, rectFrame(captionRect), {opacity: getComputedStyle(caption).opacity});
    dialog.append(ghost);
    if (!reduced.matches && ghost.animate) {
      ghostAnimation = ghost.animate([{opacity: getComputedStyle(caption).opacity}, {opacity: 0}],
        {duration: 320, easing: 'ease-in-out', fill: 'forwards'});
      ghostAnimation.finished.catch(() => {});
    } else ghost.style.opacity = '0';
    onOpen();
    closeButton.focus({preventScroll: true});
    move(hero.getBoundingClientRect(), true, 1100);
  }
  const click = event => {
    const button = event.target.closest('[data-read-more]');
    if (button && feed.contains(button)) open(button.closest('[data-scroll-item]'), button);
  };
  const cancel = event => { event.preventDefault(); close(); };
  function resize() {
    if (state === 'opening') move(hero.getBoundingClientRect(), true, 500);
    else if (state === 'closing') move(viewport(), false, 500);
  }
  const motionChange = () => { if (reduced.matches) resize(); };
  feed.addEventListener('click', click);
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', cancel);
  window.addEventListener('resize', resize);
  reduced.addEventListener?.('change', motionChange);
  return {
    close,
    destroy() {
      destroyed = true; ++generation; animation?.cancel(); shadeAnimation?.cancel(); removeGhost();
      feed.removeEventListener('click', click);
      closeButton.removeEventListener('click', close);
      dialog.removeEventListener('cancel', cancel);
      window.removeEventListener('resize', resize);
      reduced.removeEventListener?.('change', motionChange);
      if (state !== 'closed') { feed.inert = false; feed.style.overflowY = savedOverflow; dialog.close(); }
      dialog.remove();
    }
  };
}
