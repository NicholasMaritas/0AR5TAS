import { createMomentumScroll } from './momentum-scroll.js?v=2';
import { createFadeScroll } from '../fade-scroll/fade-scroll.js?v=2';
import { createPhotoArticle } from '../photo-article/photo-article.js?v=1';
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
let captions = createFadeScroll(feed, {delay: 400});
const article = createPhotoArticle(feed, {
  onOpen() { captions.destroy(); },
  onClose() { captions = createFadeScroll(feed, {delay: 400}); }
});
window.addEventListener('pagehide', event => {
  if (!event.persisted) { article.destroy(); captions.destroy(); momentum.destroy(); }
});

