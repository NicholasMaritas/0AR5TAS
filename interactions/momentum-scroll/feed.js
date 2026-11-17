import { createMomentumScroll } from './momentum-scroll.js?v=2';
const feed = document.querySelector('.photo-feed');
const counter = document.querySelector('#photo-count');
const hint = document.querySelector('.hint');
const controller = createMomentumScroll(feed, {
  onActiveChange({index, count}) {
    counter.textContent = String(index + 1).padStart(2, '0') + ' / ' + String(count).padStart(2, '0');
    if (index > 0) hint.hidden = true;
    // Prepare adjacent full-screen images without tying decoding to the scroll handler.
    const photos = feed.querySelectorAll('[data-scroll-item]');
    for (const neighbor of [index - 1, index + 1]) {
      const image = photos[neighbor]?.querySelector('img');
      if (image) { image.loading = 'eager'; image.decode?.().catch(() => {}); }
    }
  }
});
window.addEventListener('pagehide', event => {
  if (!event.persisted) controller.destroy();
});
