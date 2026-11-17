import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoArticle } from './photo-article.js';

// Model only the browser boundary: events, rectangles, focus and cancellable
// WAAPI promises. Finishing an animation is explicit, so interruption races are
// deterministic rather than depending on wall-clock sleeps.
async function flush() {
  for (let turn = 0; turn < 6; turn++) await Promise.resolve();
}

function browser({reduced = false} = {}) {
  const globals = ['document', 'window', 'matchMedia', 'getComputedStyle'];
  const saved = Object.fromEntries(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const targets = [], animations = [], order = [];
  let scrollPosition = 1514, scrollWrites = 0;
  class Element {
    constructor(name) {
      this.name = name; this.listeners = new Map(); this.attributes = new Map();
      this.style = {}; this.dataset = {}; this.children = []; this.selectors = new Map();
      this.rect = {left: 0, top: 0, width: 1180, height: 757};
      this.hidden = false; this.inert = false; this.textContent = '';
      targets.push(this);
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    emit(type, properties = {}) {
      const event = {target: this, prevented: false, preventDefault() {this.prevented = true;}, ...properties};
      for (const fn of [...(this.listeners.get(type) || [])]) fn(event);
      return event;
    }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    removeAttribute(key) { this.attributes.delete(key); }
    append(child) { this.children.push(child); child.parent = this; }
    remove() { this.removed = true; this.parent?.children.splice(this.parent.children.indexOf(this), 1); }
    querySelector(selector) { return this.selectors.get(selector) || null; }
    querySelectorAll(selector) {
      const value = this.selectors.get(selector);
      return Array.isArray(value) ? value : value ? [value] : [];
    }
    closest(selector) {
      if (selector === '[data-read-more]' && this.name === 'read-more') return this;
      if (selector === '[data-scroll-item]' && this.name === 'photo') return this;
      return this.parent?.closest(selector) || null;
    }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    focus(options) { doc.activeElement = this; this.focusOptions = options; }
    getBoundingClientRect() {
      if (this.presentation) return {...this.presentation};
      if (this.name === 'flight') return Object.fromEntries(['left', 'top', 'width', 'height'].map(key => [key, Number.parseFloat(this.style[key]) || 0]));
      return {...this.rect};
    }
    animate(frames, options) {
      let resolve, reject, pending = true;
      const animation = {
        target: this, frames, options,
        finished: new Promise((res, rej) => {resolve = res; reject = rej;}),
        cancel: () => {
          this.presentation = null;
          animation.cancelled = true;
          if (pending) { pending = false; reject(new Error('cancelled')); }
        },
        finish: () => { if (pending) {pending = false; resolve();} }
      };
      // Native WAAPI rejects canceled promises. Give ghost fades the same safe
      // browser-level rejection handling used by the test runner's environment.
      animation.finished.catch(() => {});
      animations.push(animation); order.push(`animate:${this.name}`);
      return animation;
    }
    cloneNode() {
      const copy = new Element('caption-ghost'); copy.rect = {...this.rect}; return copy;
    }
    showModal() { this.open = true; order.push('show-dialog'); }
    close() { this.open = false; order.push('close-dialog'); }
    set innerHTML(value) {
      if (this.name !== 'dialog') return;
      this.html = value;
      const scroller = new Element('article-scroll'); scroller.scrollTop = 0;
      const hero = new Element('hero'); hero.rect = {left: 767, top: 167, width: 344, height: 389};
      Object.assign(hero, {complete: true, naturalWidth: 1800});
      const flight = new Element('flight'), flyingImage = new Element('flying-image');
      Object.assign(flyingImage, {complete: true, naturalWidth: 1800});
      flight.hidden = true; flight.selectors.set('img', flyingImage); flight.append(flyingImage);
      const closeButton = new Element('close'), title = new Element('title');
      const series = [new Element('series-header'), new Element('series-breadcrumb')];
      this.selectors = new Map([
        ['.article-scroll', scroller], ['.article-image img', hero], ['.photo-flight', flight],
        ['.article-close', closeButton], ['#article-title', title], ['[data-article-series]', series],
        ['[data-article-name]', new Element('article-name')],
        ['[data-article-description]', new Element('description')],
        ['[data-article-caption]', new Element('image-caption')]
      ]);
      [scroller, hero, flight, closeButton, title, ...series].forEach(child => this.append(child));
      this.clientWidth = 1180; this.clientHeight = 757;
    }
  }
  const win = new Element('window'), body = new Element('body'), media = new Element('media');
  const doc = {body, activeElement: null, createElement: name => new Element(name)};
  media.matches = reduced;
  const feed = new Element('feed'), photo = new Element('photo'), button = new Element('read-more');
  feed.style.overflowY = 'auto';
  Object.defineProperty(feed, 'scrollTop', {get: () => scrollPosition, set: value => {scrollWrites++; scrollPosition = value;}});
  photo.offsetTop = 1514;
  const image = new Element('source-image');
  Object.assign(image, {complete: true, naturalWidth: 1800, currentSrc: 'https://example.test/selected-1440.jpg', src: 'https://example.test/selected-1800.jpg', alt: 'Mist across green hills'});
  const title = new Element('source-title'); title.textContent = 'Quiet distance';
  const series = new Element('source-series'); series.textContent = 'Photo study / 03';
  const caption = new Element('caption'); caption.rect = {left: 59, top: 580, width: 1062, height: 113};
  photo.selectors = new Map([['img', image], ['h1,h2', title], ['small', series], ['figcaption', caption]]);
  feed.append(photo); photo.append(button);
  const values = {document: doc, window: win, matchMedia: () => media,
    getComputedStyle: element => ({opacity: '1', objectPosition: '50% 50%', visibility: element.style.visibility || 'visible'})};
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, {configurable: true, writable: true, value});
  let opens = 0, closes = 0;
  const controller = createPhotoArticle(feed, {onOpen() {opens++; order.push('on-open');}, onClose() {closes++;}});
  const dialog = body.children[0], scroller = dialog.querySelector('.article-scroll');
  const hero = dialog.querySelector('.article-image img'), flight = dialog.querySelector('.photo-flight');
  const closeButton = dialog.querySelector('.article-close');
  const lastFlight = () => animations.filter(animation => animation.target === flight).at(-1);
  return {
    feed, photo, button, image, dialog, scroller, hero, flight, closeButton, controller, media, win, doc, order, animations,
    async open() {feed.emit('click', {target: button}); await flush();},
    flush,
    deferDecode() {
      let first, second;
      hero.decode = () => new Promise(resolve => {first = resolve;});
      flight.querySelector('img').decode = () => new Promise(resolve => {second = resolve;});
      return {hero: () => first(), flying: () => second()};
    },
    lastFlight,
    async finishFlight() { lastFlight()?.finish(); await Promise.resolve(); await Promise.resolve(); },
    listenerCount: () => targets.reduce((sum, target) => sum + [...target.listeners.values()].reduce((n, set) => n + set.size, 0), 0),
    get opens() {return opens;}, get closes() {return closes;}, get scrollWrites() {return scrollWrites;},
    restore() {
      controller.destroy();
      for (const key of globals) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else delete globalThis[key]; }
    }
  };
}

async function withBrowser(options, run) {
  const env = browser(options);
  try {await run(env);} finally {env.restore();}
}

test('opening reveals a fixed article below the moving selected photo, then enables reading', () => withBrowser({}, async env => {
  await env.open();
  assert.equal(env.dialog.open, true);
  assert.equal(env.dialog.dataset.articleState, 'opening');
  assert.equal(env.feed.inert, true);
  assert.equal(env.feed.style.overflowY, 'hidden');
  assert.equal(env.scroller.style.overflowY, 'hidden');
  assert.equal(env.dialog.querySelector('#article-title').textContent, 'Quiet distance');
  assert.equal(env.hero.src, env.image.currentSrc, 'reuse decoded responsive candidate');
  assert.equal(env.hero.alt, env.image.alt);
  assert(env.order.indexOf('show-dialog') < env.order.indexOf('animate:flight'));
  assert(env.animations.every(animation => env.flight.contains(animation.target) || animation.target.name === 'caption-ghost'), 'article itself remains stationary');
  const frames = env.lastFlight().frames;
  assert.deepEqual(frames[0], {left: '0px', top: '0px', width: '1180px', height: '757px'});
  assert.deepEqual(frames[1], {left: '767px', top: '167px', width: '344px', height: '389px'});
  await env.finishFlight();
  assert.equal(env.dialog.dataset.articleState, 'open');
  assert.equal(env.scroller.style.overflowY, 'auto');
  assert.equal(env.flight.hidden, true);
  assert.equal(env.hero.style.visibility, '');
  assert.equal(env.opens, 1);
  assert.equal(env.scrollWrites, 0, 'native feed position is untouched');
}));

test('close starts at the actual scrolled image and restores the same feed position and focus', () => withBrowser({}, async env => {
  await env.open(); await env.finishFlight();
  env.scroller.scrollTop = 600;
  env.hero.rect.top = -433;
  env.closeButton.emit('click');
  assert.equal(env.dialog.dataset.articleState, 'closing');
  assert.equal(env.lastFlight().frames[0].top, '-433px');
  assert.equal(env.lastFlight().frames[1].height, '757px');
  assert.equal(env.scroller.style.overflowY, 'hidden');
  await env.finishFlight();
  assert.equal(env.dialog.open, false);
  assert.equal(env.feed.inert, false);
  assert.equal(env.feed.style.overflowY, 'auto');
  assert.equal(env.feed.scrollTop, 1514);
  assert.equal(env.scrollWrites, 0);
  assert.equal(env.doc.activeElement, env.button);
  assert.deepEqual(env.button.focusOptions, {preventScroll: true});
  assert.equal(env.closes, 1);
}));

test('when returning caption is still hidden, focus returns to the feed without shifting its photo', () => withBrowser({}, async env => {
  await env.open(); await env.finishFlight();
  // Caption controller may rearm a short reveal delay on close. Its hidden
  // Read more button cannot receive focus until that caption becomes visible.
  env.button.style.visibility = 'hidden';
  env.controller.close(); await env.finishFlight();
  assert.equal(env.dialog.open, false);
  assert.equal(env.doc.activeElement, env.feed);
  assert.deepEqual(env.feed.focusOptions, {preventScroll: true});
  assert.equal(env.feed.scrollTop, 1514);
  assert.equal(env.scrollWrites, 0);
}));

test('Escape interrupts opening at its current rectangle and stale completion cannot reopen it', () => withBrowser({}, async env => {
  await env.open();
  const opening = env.lastFlight();
  env.flight.presentation = {left: 300, top: 70, width: 800, height: 600};
  const escape = env.dialog.emit('cancel');
  assert.equal(escape.prevented, true, 'avoid instant native dialog removal');
  assert.equal(opening.cancelled, true);
  assert.equal(env.lastFlight().frames[0].left, '300px');
  assert.equal(env.lastFlight().frames[0].width, '800px');
  await Promise.resolve();
  assert.equal(env.dialog.dataset.articleState, 'closing');
  opening.finish();
  await env.finishFlight();
  assert.equal(env.dialog.dataset.articleState, 'closed');
  assert.equal(env.closes, 1);
}));

test('ordinary clicks and unready images do not open; repeated Read more cannot create overlapping transitions', () => withBrowser({}, async env => {
  env.feed.emit('click', {target: env.photo});
  assert.equal(env.dialog.open, undefined);
  env.image.complete = false; await env.open();
  assert.equal(env.opens, 0);
  env.image.complete = true; env.image.naturalWidth = 0; await env.open();
  assert.equal(env.opens, 0);
  env.image.naturalWidth = 1800; await env.open(); await env.open();
  assert.equal(env.opens, 1);
  assert.equal(env.animations.filter(animation => animation.target === env.flight).length, 1);
  await env.finishFlight();
}));

test('reduced motion opens and closes without traveling animations', () => withBrowser({reduced: true}, async env => {
  await env.open();
  assert.equal(env.dialog.dataset.articleState, 'open');
  assert.equal(env.scroller.style.overflowY, 'auto');
  assert.equal(env.animations.length, 0);
  env.controller.close();
  assert.equal(env.dialog.dataset.articleState, 'closed');
  assert.equal(env.dialog.open, false);
  assert.equal(env.feed.inert, false);
  assert.equal(env.scrollWrites, 0);
}));

test('resize retargets an in-progress transition continuously rather than jumping to a stale endpoint', () => withBrowser({}, async env => {
  await env.open();
  const old = env.lastFlight();
  env.flight.presentation = {left: 300, top: 60, width: 800, height: 600};
  env.hero.rect = {left: 220, top: 160, width: 300, height: 340};
  env.win.emit('resize');
  assert.equal(old.cancelled, true);
  assert.equal(env.lastFlight().frames[0].left, '300px');
  assert.equal(env.lastFlight().frames[1].left, '220px');
  await env.finishFlight();
  assert.equal(env.dialog.dataset.articleState, 'open');
}));

test('changing to reduced motion during a transition completes its final layout immediately', () => withBrowser({}, async env => {
  await env.open();
  const old = env.lastFlight();
  env.media.matches = true; env.media.emit('change');
  assert.equal(old.cancelled, true);
  assert.equal(env.dialog.dataset.articleState, 'open');
  assert.equal(env.flight.hidden, true);
  assert.equal(env.scroller.style.overflowY, 'auto');
}));

test('after a viewport resize, close restores the selected photo at its new native snap position', () => withBrowser({reduced: true}, async env => {
  await env.open();
  // Browser layout changes the photo start while hidden feed scrollTop remains
  // its old value. Closing must preserve photo identity rather than that pixel.
  env.photo.offsetTop = 1200;
  env.dialog.clientHeight = 600;
  env.win.emit('resize');
  env.controller.close();
  assert.equal(env.feed.scrollTop, 1200);
  assert.equal(env.scrollWrites, 1, 'only resize recovery requires a position write');
  assert.equal(env.doc.activeElement, env.button);
}));

test('both image copies decode before the article is exposed or its cover starts moving', () => withBrowser({}, async env => {
  const ready = env.deferDecode();
  await env.open();
  assert.equal(env.dialog.dataset.articleState, 'preparing');
  assert.equal(env.dialog.open, undefined);
  assert.equal(env.feed.inert, false);
  assert.equal(env.feed.style.overflowY, 'auto');
  assert.equal(env.animations.length, 0);
  ready.hero(); await env.flush();
  assert.equal(env.dialog.dataset.articleState, 'preparing', 'one decoded copy is insufficient');
  ready.flying(); await env.flush();
  assert.equal(env.dialog.dataset.articleState, 'opening');
  assert.equal(env.dialog.open, true);
  await env.finishFlight();
}));

test('canceling pending decode leaves the feed visible and late readiness cannot open the article', () => withBrowser({}, async env => {
  const ready = env.deferDecode();
  await env.open();
  env.controller.close();
  assert.equal(env.dialog.dataset.articleState, 'closed');
  ready.hero(); ready.flying(); await env.flush();
  assert.notEqual(env.dialog.open, true);
  assert.equal(env.opens, 0);
  assert.equal(env.animations.length, 0);
  assert.equal(env.feed.style.overflowY, 'auto');
  assert.equal(env.scrollWrites, 0);
}));

test('scrolling during decode preserves the new feed view instead of covering it with the old selection', () => withBrowser({}, async env => {
  const ready = env.deferDecode();
  await env.open();
  env.feed.scrollTop = 2271; // User/browser movement while preparation is pending.
  ready.hero(); ready.flying(); await env.flush();
  assert.equal(env.dialog.dataset.articleState, 'closed');
  assert.notEqual(env.dialog.open, true);
  assert.equal(env.feed.scrollTop, 2271);
  assert.equal(env.scrollWrites, 1, 'controller must not undo user movement');
  assert.equal(env.feed.inert, false);
  assert.equal(env.opens, 0);
  assert.equal(env.animations.length, 0);
}));

test('layout changes during decode cancel a stale full-screen source rectangle', () => withBrowser({}, async env => {
  const ready = env.deferDecode();
  await env.open();
  env.photo.offsetTop = 1200;
  env.win.emit('resize');
  ready.hero(); ready.flying(); await env.flush();
  assert.equal(env.dialog.dataset.articleState, 'closed');
  assert.notEqual(env.dialog.open, true);
  assert.equal(env.opens, 0);
  assert.equal(env.animations.length, 0);
  assert.equal(env.scrollWrites, 0);
}));

test('destroying during preparation makes later decode completion inert', () => withBrowser({}, async env => {
  const ready = env.deferDecode();
  await env.open();
  env.controller.destroy();
  ready.hero(); ready.flying(); await env.flush();
  assert.equal(env.dialog.removed, true);
  assert.notEqual(env.dialog.open, true);
  assert.equal(env.feed.inert, false);
  assert.equal(env.opens, 0);
  assert.equal(env.animations.length, 0);
  assert.equal(env.listenerCount(), 0);
}));

test('decode rejection cannot trap the controller in a preparation state', () => withBrowser({}, async env => {
  env.hero.decode = () => Promise.reject(new Error('decode unavailable'));
  env.flight.querySelector('img').decode = () => Promise.reject(new Error('decode unavailable'));
  await env.open();
  assert.equal(env.dialog.dataset.articleState, 'opening');
  await env.finishFlight();
  assert.equal(env.dialog.dataset.articleState, 'open');
}));

test('an image copy that fails loading leaves the working feed visible', () => withBrowser({}, async env => {
  const copy = env.flight.querySelector('img');
  copy.complete = true; copy.naturalWidth = 0;
  copy.decode = () => Promise.reject(new Error('broken image'));
  await env.open();
  assert.equal(env.dialog.dataset.articleState, 'closed');
  assert.notEqual(env.dialog.open, true);
  assert.equal(env.feed.inert, false);
  assert.equal(env.feed.style.overflowY, 'auto');
  assert.equal(env.opens, 0);
  assert.equal(env.animations.length, 0);
  assert.equal(env.scrollWrites, 0);
}));

test('destroy cancels pending motion, unlocks background, and removes dialog and listeners', () => withBrowser({}, async env => {
  await env.open();
  const animation = env.lastFlight();
  env.controller.destroy();
  await Promise.resolve();
  assert.equal(animation.cancelled, true);
  assert.equal(env.feed.inert, false);
  assert.equal(env.feed.style.overflowY, 'auto');
  assert.equal(env.dialog.removed, true);
  assert.equal(env.listenerCount(), 0);
  assert.equal(env.scrollWrites, 0);
}));
