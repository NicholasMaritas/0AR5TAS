import { createMomentumScroll } from './momentum-scroll.js?v=2';
import { createFadeScroll } from '../fade-scroll/fade-scroll.js?v=1';
const feed = document.querySelector('.photo-feed');
const momentum = createMomentumScroll(feed, {
  onActiveChange({index}) {
    const photos = feed.querySelectorAll('[data-scroll-item]');
    for (const neighbor of [index - 1, index + 1]) {
      const image = photos[neighbor]?.querySelector('img');
      if (image) { image.loading = 'eager'; image.decode?.().catch(() => {}); }
    }
  }
});
const captions = createFadeScroll(feed, {delay: 2000});
window.addEventListener('pagehide', event => {
  if (!event.persisted) { captions.destroy(); momentum.destroy(); }
});
