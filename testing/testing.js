import {createArchiveSelector} from '../interactions/archive-media-selector/archive-selector.js';
import {createLoopMenu} from '../navigation/looping-dot-menu/menu.js?v=7';

export const options = [
  {label:'One', id:'1595381799430'},
  {label:'Two', id:'1595398676148'},
  {label:'Three', id:'1595400105447'},
  {label:'Four', id:'1595403925337'},
  {label:'Five', id:'1595449047435'},
  {label:'Six', id:'1595535440673'},
  {label:'Seven', id:'1595537714238'},
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
    link.dataset.id = option.id;
    link.querySelector('.link-name').textContent = option.label;
    link.querySelector('.desktop-name').textContent = option.label;
  }
  root.append(navigation);
  host.append(root);
  const archive = createArchiveSelector(root);
  const menu = createLoopMenu(navigation);
  const activated = event => {
    const link = event.target.closest?.('.loop-link[data-ticker-item]');
    if (!link || !navigation.contains(link)) return;
    // The archive's delegated handler has already selected this ID. The menu's
    // capture-phase drag suppression prevents this listener on trailing clicks.
    for (const item of links) item.toggleAttribute('aria-current', item === link);
    link.setAttribute('aria-current', 'page');
    root.dataset.selected = link.dataset.id;
  };
  root.addEventListener('click', activated);
  let destroyed = false;
  return {destroy() {
    if (destroyed) return;
    destroyed = true;
    root.removeEventListener('click', activated);
    menu.destroy(); archive.destroy(); root.remove();
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
