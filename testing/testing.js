import {createArchiveSelector} from '../interactions/archive-media-selector/archive-selector.js';
import {createLoopMenu} from '../navigation/looping-dot-menu/menu.js?v=7';
import {mountRadioCatalogue} from '../media/radio-catalogue-player/radio-player.js?v=3';
import {createMusicSession} from './music-session.js?v=1';
import {createPhotoSection} from './photo-section.js?v=1';

export const options = [
  {label:'One', id:'1595381799430'},
  {label:'Two', id:'1595398676148'},
  {label:'Three', id:'1595400105447'},
  {label:'Four', id:'1595403925337'},
  {label:'Five', id:'1595449047435'},
  {label:'Six', id:'1595535440673'},
  {label:'Music', id:'1595537714238'},
];

export function mountTesting(host, archiveMarkup, navigationMarkup) {
  const doc = host.ownerDocument;
  const template = doc.createElement('template');
  template.innerHTML = archiveMarkup;
  const root = template.content.querySelector('[data-section-type="ticker-page"]');
  if (!root) throw new Error('Archive component missing.');
  // Prune while inert, so removed central images never enter the live document.
  root.querySelectorAll('.ticker').forEach(node => node.remove());
  const ids = new Set(options.map(option => option.id));
  root.querySelectorAll('[data-ticker-caption],[data-ticker-background]').forEach(node => {
    if (!ids.has(node.getAttribute('data-id'))) node.remove();
  });
  const navTemplate = doc.createElement('template');
  navTemplate.innerHTML = navigationMarkup;
  const navigation = navTemplate.content.querySelector('.loop-nav');
  const links = [...navigation.querySelectorAll('.loop-link')];
  if (links.length !== options.length) throw new Error('Seven navigation choices required.');
  for (let index = 0; index < options.length; index++) {
    const option = options[index], link = links[index];
    link.href = `#${option.label.toLowerCase()}`;
    link.setAttribute('data-ticker-item', '');
    if (index === 5) link.removeAttribute('data-ticker-item');
    link.dataset.id = option.id;
    link.querySelector('.link-name').textContent = option.label;
    link.querySelector('.desktop-name').textContent = option.label;
  }
  root.append(navigation);
  host.append(root);
  const archive = createArchiveSelector(root);
  const menu = createLoopMenu(navigation);
  const music = doc.createElement('section');
  music.className = 'testing-music';
  music.setAttribute('aria-label', 'Music catalogue');
  music.hidden = true;
  const musicStatus = doc.createElement('p');
  musicStatus.className = 'music-loading';
  musicStatus.setAttribute('role', 'status');
  music.append(musicStatus);
  root.append(music);
  const musicSession = createMusicSession({
    visible(value) {
      music.hidden = !value;
      root.dataset.musicActive = String(value);
    },
    async load() {
      const response = await fetch('../media/radio-catalogue-player/catalogue.json');
      if (!response.ok) throw new Error('Music catalogue unavailable.');
      return response.json();
    },
    loading() { musicStatus.textContent = 'Loading music…'; },
    failed() { musicStatus.textContent = 'Music could not load. Select Music to retry.'; },
    mount(catalogue) {
      const radio = mountRadioCatalogue(music, {tracks:catalogue.tracks, initialIndex:0, showPlayer:false});
      // Keep the same audio node outside the visual section when it is hidden.
      const audio = music.querySelector('audio');
      audio.setAttribute('aria-hidden', 'true');
      root.append(audio);
      musicStatus.textContent = '';
      return radio;
    },
  });
  const photoSection = createPhotoSection(root, {
    onHome() {
      archive.reset();
      delete root.dataset.selected;
      links.forEach(link => link.removeAttribute('aria-current'));
      musicSession.setActive(false); photoSection.setActive(false);
    },
    returnFocus() {
      const button = navigation.querySelector('.loop-toggle');
      const target = doc.defaultView.getComputedStyle(button).display === 'none' ? links[5] : button;
      target.focus({preventScroll:true});
    },
  });
  const activated = event => {
    const link = event.target.closest?.('.loop-link[data-id]');
    if (!link || !navigation.contains(link)) return;
    event.preventDefault();
    const photosActive = link.dataset.id === options[5].id;
    if (photosActive) archive.reset();
    // Archive choices are selected by its delegated handler; Six opens Tlog. The menu's
    // capture-phase drag suppression prevents this listener on trailing clicks.
    for (const item of links) item.toggleAttribute('aria-current', item === link);
    link.setAttribute('aria-current', 'page');
    root.dataset.selected = link.dataset.id;
    musicSession.setActive(link.dataset.id === options[6].id);
    photoSection.setActive(photosActive);
  };
  root.addEventListener('click', activated);
  let destroyed = false;
  return {destroy() {
    if (destroyed) return;
    destroyed = true;
    root.removeEventListener('click', activated);
    photoSection.destroy(); musicSession.destroy(); menu.destroy(); archive.destroy(); root.remove();
  }};
}

const host = document.querySelector('[data-testing-host]');
if (host) {
  Promise.all([
    fetch('../interactions/archive-media-selector/archive.html'),
    fetch('./navigation.html'),
  ]).then(async responses => {
    if (responses.some(response => !response.ok)) throw new Error('Testing resources unavailable.');
    const [archive, navigation] = await Promise.all(responses.map(response => response.text()));
    mountTesting(host, archive, navigation);
  }).catch(() => {
    host.textContent = 'Testing could not load. Please reload.';
    host.setAttribute('role', 'alert');
  });
}
