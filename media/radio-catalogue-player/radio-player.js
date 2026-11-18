/** Native-DOM port of the extracted FUCT radio catalogue and shared player.
 * See source-analysis.json for original compiled components and documented changes.
 * No automatic mount, framework, account, storage or server request is required.
 */
export function createRadioController(audio, tracks, onChange = () => {}, options = {}) {
  if (!tracks?.length) throw new TypeError('At least one radio track is required.');
  let selected = Number.isInteger(options.initialIndex)
    ? Math.max(0, Math.min(tracks.length - 1, options.initialIndex))
    : Math.floor(Math.random() * tracks.length);
  let playing = false;
  let expanded = true;
  let progress = 0;
  let error = '';
  let revision = 0;
  let disposed = false;
  const listeners = [];
  const state = () => ({ selected, track: tracks[selected], playing, expanded, progress, error });
  const notify = () => { if (!disposed) onChange(state()); };
  const listen = (name, fn) => {
    audio.addEventListener(name, fn);
    listeners.push([name, fn]);
  };
  function pause() {
    if (disposed) return;
    revision++;
    playing = false;
    audio.pause();
    notify();
  }
  function play() {
    if (disposed) return Promise.resolve();
    const request = ++revision;
    playing = true;
    error = '';
    notify();
    let result;
    try { result = audio.play(); } catch (e) { result = Promise.reject(e); }
    return Promise.resolve(result).catch(e => {
      if (disposed || request !== revision) return;
      playing = false;
      error = e?.name === 'NotAllowedError'
        ? 'Playback was blocked. Select Play to try again.'
        : 'This mix could not play. Select Play to try again.';
      notify();
    });
  }
  function select(index, autoplay = true) {
    if (disposed || !Number.isInteger(index) || index < 0 || index >= tracks.length) return;
    if (index === selected) return autoplay ? (playing ? pause() : play()) : undefined;
    revision++;
    playing = false;
    audio.pause();
    selected = index;
    progress = 0;
    error = '';
    audio.src = tracks[selected].audio_url;
    audio.load();
    notify();
    if (autoplay) return play();
  }
  listen('timeupdate', () => {
    if (audio.ended) return;
    progress = Number.isFinite(audio.duration) && audio.duration > 0
      ? Math.min(100, Math.max(0, audio.currentTime / audio.duration * 100)) : 0;
    notify();
  });
  listen('ended', () => { revision++; playing = false; progress = 0; notify(); });
  listen('pause', () => { if (audio.paused) { playing = false; notify(); } });
  listen('error', () => {
    revision++;
    playing = false;
    error = 'This mix could not load. Select another mix or try again.';
    notify();
  });
  audio.preload = 'metadata';
  audio.src = tracks[selected].audio_url;
  notify();
  return {
    getState: state,
    select,
    play,
    pause,
    toggle: () => playing ? pause() : play(),
    toggleExpanded: () => { if (!disposed) { expanded = !expanded; notify(); } },
    destroy() {
      if (disposed) return;
      disposed = true;
      revision++;
      for (const [name, fn] of listeners) audio.removeEventListener(name, fn);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
  };
}

export function mountRadioCatalogue(root, { tracks, initialIndex } = {}) {
  if (!root || root.hasAttribute('data-radio-mounted')) {
    throw new TypeError('Provide an empty, unmounted radio root.');
  }
  if (!Array.isArray(tracks) || !tracks.length) throw new TypeError('Provide catalogue.tracks.');
  const ownsScope = !root.hasAttribute('data-fuct-radio');
  root.setAttribute('data-radio-mounted', '');
  root.setAttribute('data-fuct-radio', '');
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const cleanups = [];
  const icons = 'https://cdn.shopify.com/oxygen-v2/29569/17180/35458/1808845/build/_assets/';
  const asset = {
    play: icons + 'playIcon-NNYMEOZA.svg', pause: icons + 'pauseIcon-JDPGQUFH.svg',
    cardPlay: icons + 'whitePlayIcon-CU3UURRN.svg', cardPause: icons + 'whitePauseIcon-OU3QAV73.svg',
  };
  const el = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const listen = (node, name, fn) => {
    node.addEventListener(name, fn);
    cleanups.push(() => node.removeEventListener(name, fn));
  };
  function artwork(track, className, sizes) {
    const img = el('img', className);
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.sizes = sizes;
    img.src = track.image_display_src || track.image_url;
    if (track.image_srcset) img.srcset = track.image_srcset.map(x => `${x.url} ${x.descriptor}`).join(', ');
    return img;
  }
  const page = el('div', 'radio-page-wrapper');
  const grid = el('div', 'radio-item-wrapper');
  page.append(grid);
  const cards = tracks.map((track, index) => {
    const card = el('div', 'radio-page-col group');
    const button = el('button', 'radio-item-cta');
    button.type = 'button';
    button.setAttribute('aria-label', `Play ${track.title}`);
    button.append(artwork(track, 'radio-cover', '25vw'));
    listen(button, 'click', () => controller.select(index));
    const overlay = el('div', 'radio-playback-buttons');
    overlay.setAttribute('aria-hidden', 'true');
    const icon = el('img'); icon.alt = ''; icon.src = asset.cardPlay;
    overlay.append(icon);
    const blur = el('div', 'radio-playback-bg-wrapper');
    blur.setAttribute('aria-hidden', 'true');
    blur.append(el('div', 'radio-playback-bg'));
    const title = el('div', 'radio-description-wrapper');
    title.append(el('span', '', track.title));
    const metadata = el('div', 'radio-genres-wrapper');
    const genres = el('div', 'radio-genre-item');
    for (const genre of track.genres) genres.append(el('div', 'radio-genre-title', genre));
    metadata.append(genres, el('div', 'radio-track-date', track.date_display));
    button.append(blur, overlay);
    card.append(button, title, metadata);
    grid.append(card);
    return { button, icon, title };
  });
  const player = el('div', 'group open fuct-radio-player');
  player.setAttribute('role', 'region');
  player.setAttribute('aria-label', 'Radio player');
  const image = el('div', 'player-image-wrapper');
  const description = el('div', 'track-description-wrapper');
  const title = el('p', 'track-description-copy'); const titleText = el('span'); title.append(titleText);
  const date = el('p', 'track-date'); description.append(title, date);
  const toggle = el('button', 'play-pause-button'); toggle.type = 'button';
  const toggleIcon = el('img'); toggleIcon.alt = ''; toggle.append(toggleIcon);
  const resize = el('button', 'player-resize-button'); resize.type = 'button';
  resize.append(el('span', 'radio-resize-icon'));
  const progress = el('div', 'track-audio-progress'); progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', 'Playback progress');
  progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', '100');
  const bar = el('div', 'bar'); progress.append(bar);
  const audio = el('audio');
  const status = el('p', 'radio-status'); status.setAttribute('role', 'status');
  player.append(image, description, toggle, resize, progress, audio);
  root.append(page, player, status);
  let lastSelected = -1;
  let disposed = false;
  function measureTitles() {
    if (disposed) return;
    for (const wrapper of [...cards.map(c => c.title), title]) {
      const span = wrapper.firstElementChild;
      span.classList.toggle('text-animate', wrapper.clientWidth < span.scrollWidth);
    }
  }
  function render(state) {
    if (lastSelected !== state.selected) {
      lastSelected = state.selected;
      image.replaceChildren(artwork(state.track, 'player-image', '2vw'));
      titleText.textContent = state.track.title;
      const [year, month, day] = state.track.date.split('-');
      date.textContent = `${month}-${day}-${year}`;
      view.requestAnimationFrame(measureTitles);
    }
    player.classList.toggle('open', state.expanded);
    toggleIcon.src = state.playing ? asset.pause : asset.play;
    toggle.setAttribute('aria-label', state.playing ? 'Pause radio' : 'Play radio');
    resize.setAttribute('aria-label', state.expanded ? 'Collapse player' : 'Expand player');
    resize.setAttribute('aria-expanded', String(state.expanded));
    bar.style.width = `${state.progress}%`;
    progress.setAttribute('aria-valuenow', String(Math.round(state.progress)));
    status.textContent = state.error;
    cards.forEach((card, i) => {
      const active = i === state.selected && state.playing;
      card.icon.src = active ? asset.cardPause : asset.cardPlay;
      card.button.setAttribute('aria-label', `${active ? 'Pause' : 'Play'} ${tracks[i].title}`);
      card.button.setAttribute('aria-pressed', String(active));
    });
  }
  const controller = createRadioController(audio, tracks, render, { initialIndex });
  listen(toggle, 'click', () => controller.toggle());
  listen(resize, 'click', () => { controller.toggleExpanded(); measureTitles(); });
  listen(view, 'resize', measureTitles);
  doc.fonts?.ready.then(measureTitles);
  measureTitles();
  return {
    ...controller,
    destroy() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups) cleanup();
      controller.destroy();
      page.remove(); player.remove(); status.remove();
      root.removeAttribute('data-radio-mounted');
      if (ownsScope) root.removeAttribute('data-fuct-radio');
    },
  };
}
