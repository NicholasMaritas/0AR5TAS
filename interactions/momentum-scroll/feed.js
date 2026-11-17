import { createMomentumScroll } from './momentum-scroll.js';
const feed = document.querySelector('.photo-feed');
const controller = createMomentumScroll(feed);
const photos = [...feed.querySelectorAll('[data-scroll-item]')];
const counter = document.querySelector('#photo-count');
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.intersectionRatio > .5) {
    counter.textContent = String(photos.indexOf(entry.target) + 1).padStart(2,'0') + ' / ' + String(photos.length).padStart(2,'0');
  }
}, {root:feed,threshold:[.5,.51]});
photos.forEach(photo => observer.observe(photo));
window.addEventListener('pagehide', event => {
  if (!event.persisted) { controller.destroy(); observer.disconnect(); }
});
