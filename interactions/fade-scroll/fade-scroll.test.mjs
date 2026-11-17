import test from 'node:test';
import assert from 'node:assert/strict';
import { createFadeScroll, alignedIndex } from './fade-scroll.js';

// Minimal browser model: time, events, geometry and image readiness. All scroll
// position changes in tests model user/browser actions, never controller writes.
function browser({ nativeScrollEnd = true, reduced = false, position = 0 } = {}) {
  const names = ['window', 'document', 'performance', 'requestAnimationFrame',
    'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'matchMedia',
    'ResizeObserver', 'getComputedStyle'];
  const saved = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let now = 0, nextId = 0, scrollWrites = 0;
  const jobs = new Map(), targets = [];
  class Target {
    constructor() { this.listeners = new Map(); targets.push(this); }
    addEventListener(type, fn, options) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push({ fn, capture: typeof options === 'boolean' ? options : Boolean(options?.capture) });
    }
    removeEventListener(type, fn, options) {
      const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
      this.listeners.set(type, (this.listeners.get(type) || []).filter(entry => entry.fn !== fn || entry.capture !== capture));
    }
    emit(type, values = {}) {
      const event = { type, target: this, currentTarget: this, preventDefault() {}, ...values };
      for (const { fn } of [...(this.listeners.get(type) || [])]) fn(event);
    }
  }
  class Element extends Target {
    constructor() { super(); this.attributes = new Map(); this.style = {}; }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    hasAttribute(name) { return this.attributes.has(name); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    toggleAttribute(name, force) {
      const enabled = force ?? !this.hasAttribute(name);
      if (enabled) this.setAttribute(name, ''); else this.removeAttribute(name);
      return enabled;
    }
  }
  const win = new Target(), doc = new Target(), media = new Target();
  doc.visibilityState = 'visible'; doc.hidden = false;
  media.matches = reduced;
  media.addListener = fn => media.addEventListener('change', fn);
  media.removeListener = fn => media.removeEventListener('change', fn);
  const container = new Element();
  Object.assign(container, {
    clientTop: 0, clientHeight: 1000, clientWidth: 800, scrollHeight: 3000,
    getBoundingClientRect: () => ({ top: 0, bottom: 1000, height: 1000, left: 0, width: 800 }),
    ownerDocument: doc
  });
  if (nativeScrollEnd) container.onscrollend = null;
  Object.defineProperty(container, 'scrollTop', {
    get: () => position,
    set: value => { scrollWrites++; position = value; }
  });
  const items = Array.from({ length: 3 }, (_, index) => {
    const item = new Element(), image = new Element();
    image.complete = true; image.naturalWidth = 1600; image.localName = 'img';
    item.image = image; item.height = 1000; item.start = index * 1000;
    item.setAttribute('data-scroll-item', '');
    item.ownerDocument = doc;
    item.getBoundingClientRect = () => ({ top: item.start - position, bottom: item.start - position + item.height,
      height: item.height, left: 0, width: 800 });
    item.querySelector = selector => selector === 'img' ? image : null;
    return item;
  });
  container.querySelectorAll = selector => selector.includes('data-caption-visible')
    ? items.filter(item => item.hasAttribute('data-caption-visible')) : items;
  container.contains = value => items.includes(value) || items.some(item => item.image === value);
  let resizeCallback;
  const timeout = (fn, delay = 0) => { jobs.set(++nextId, { due: now + Math.max(0, delay), fn, frame: false }); return nextId; };
  const frame = fn => { jobs.set(++nextId, { due: (Math.floor(now / 16) + 1) * 16, fn, frame: true }); return nextId; };
  const cancel = id => jobs.delete(id);
  const values = {
    window: win, document: doc, performance: { now: () => now },
    requestAnimationFrame: frame, cancelAnimationFrame: cancel,
    setTimeout: timeout, clearTimeout: cancel, matchMedia: () => media,
    ResizeObserver: class { constructor(fn) { resizeCallback = fn; } observe() {} disconnect() { resizeCallback = null; } },
    getComputedStyle: () => ({ scrollSnapType: reduced ? 'none' : 'y mandatory' })
  };
  Object.assign(win, { document: doc, ...values }); doc.defaultView = win;
  for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  function advance(ms) {
    const end = now + ms;
    let safety = 0;
    while (true) {
      const entry = [...jobs.entries()].filter(([, job]) => job.due <= end).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      if (!entry) break;
      assert(++safety < 10000, 'controller must not create a busy timer loop');
      const [id, job] = entry; jobs.delete(id); now = job.due;
      job.frame ? job.fn(now) : job.fn();
    }
    now = end;
  }
  const visible = () => items.map((item, index) => item.hasAttribute('data-caption-visible') ? index : -1).filter(index => index >= 0);
  return {
    container, items, win, doc, media, advance, visible,
    get now() { return now; }, get scrollWrites() { return scrollWrites; },
    scroll(value) { position = value; container.emit('scroll'); },
    scrollEnd() { container.emit('scrollend'); },
    imageLoaded(index) { const image = items[index].image; image.complete = true; image.naturalWidth = 1600; image.emit('load'); container.emit('load', { target: image }); },
    resize() { resizeCallback?.([{ target: container }]); win.emit('resize'); },
    visibility(state) { doc.visibilityState = state; doc.hidden = state !== 'visible'; doc.emit('visibilitychange'); },
    waitForState(expected, max = 1000) {
      const deadline = now + max;
      while (container.getAttribute('data-fade-scroll-state') !== expected && now < deadline) advance(1);
      assert.equal(container.getAttribute('data-fade-scroll-state'), expected);
    },
    listenerCount() { return targets.reduce((sum, target) => sum + [...target.listeners.values()].reduce((n, entries) => n + entries.length, 0), 0); },
    restore() {
      for (const name of names) {
        if (saved[name]) Object.defineProperty(globalThis, name, saved[name]);
        else delete globalThis[name];
      }
    }
  };
}

function withBrowser(options, run) {
  const env = browser(options);
  let controller;
  try { controller = createFadeScroll(env.container); run(env, controller); }
  finally { controller?.destroy(); env.restore(); }
}

test('alignment requires start alignment and a fully fitting item', () => {
  assert.equal(alignedIndex([{ top: 0, bottom: 1000, height: 1000 }], 0, 1000), 0);
  assert.equal(alignedIndex([{ top: .5, bottom: 900.5, height: 900 }], 0, 1000), 0);
  assert.equal(alignedIndex([{ top: 2, bottom: 1002, height: 1000 }], 0, 1000), -1);
  assert.equal(alignedIndex([{ top: 0, bottom: 1200, height: 1200 }], 0, 1000), -1);
  assert.equal(alignedIndex([{ top: -1000, bottom: 0, height: 1000 }, { top: 0, bottom: 1000, height: 1000 }], 0, 1000), 1);
});

test('initial settled page waits two seconds before revealing only its caption', () => withBrowser({}, env => {
  assert.deepEqual(env.visible(), []);
  env.waitForState('waiting');
  env.advance(1999); assert.deepEqual(env.visible(), []);
  env.advance(17); assert.deepEqual(env.visible(), [0]);
  assert.equal(env.container.getAttribute('data-fade-scroll-state'), 'visible');
}));

test('scrolling hides immediately and an unaligned native scrollend cannot reveal', () => withBrowser({}, env => {
  env.advance(2500); assert.deepEqual(env.visible(), [0]);
  env.scroll(650); assert.deepEqual(env.visible(), []);
  env.scrollEnd(); env.advance(3000); assert.deepEqual(env.visible(), []);
  env.scroll(1000); env.scrollEnd(); env.waitForState('waiting');
  env.advance(1999); assert.deepEqual(env.visible(), []);
  env.advance(17); assert.deepEqual(env.visible(), [1]);
}));

test('a new input invalidates the old reveal deadline and gets a fresh delay', () => withBrowser({}, env => {
  env.waitForState('waiting'); env.advance(1000);
  env.container.emit('wheel', { deltaY: -10 });
  env.advance(1100); assert.deepEqual(env.visible(), []);
  env.advance(1400); assert.deepEqual(env.visible(), [0]);
}));

test('held touch blocks revealing even when scrollend is dispatched', () => withBrowser({}, env => {
  env.waitForState('waiting');
  env.container.emit('touchstart', { touches: [{}] });
  env.scroll(1000); env.scrollEnd(); env.advance(4000);
  assert.deepEqual(env.visible(), []);
  env.container.emit('touchend', { touches: [] }); env.scrollEnd();
  env.waitForState('waiting'); env.advance(2016); assert.deepEqual(env.visible(), [1]);
}));

test('wheel at a boundary recovers without a native scrollend', () => withBrowser({}, env => {
  env.advance(2500); assert.deepEqual(env.visible(), [0]);
  env.container.emit('wheel', { deltaY: -100 });
  assert.deepEqual(env.visible(), []);
  env.advance(179); assert.deepEqual(env.visible(), []);
  env.waitForState('waiting'); env.advance(1999); assert.deepEqual(env.visible(), []);
  env.advance(17); assert.deepEqual(env.visible(), [0]);
}));

test('without scrollend, quiet stable aligned scrolling can reveal', () => withBrowser({ nativeScrollEnd: false }, env => {
  env.advance(2500); env.scroll(1000);
  env.advance(179); assert.deepEqual(env.visible(), []);
  env.waitForState('waiting'); env.advance(1999); assert.deepEqual(env.visible(), []);
  env.advance(17); assert.deepEqual(env.visible(), [1]);
}));

test('unready image cannot reveal; image load starts a new complete delay', () => {
  const env = browser(); let controller;
  try {
    env.items[0].image.complete = false; env.items[0].image.naturalWidth = 0;
    controller = createFadeScroll(env.container); env.advance(4000);
    assert.deepEqual(env.visible(), []);
    env.imageLoaded(0); env.waitForState('waiting');
    env.advance(1999); assert.deepEqual(env.visible(), []);
    env.advance(17); assert.deepEqual(env.visible(), [0]);
  } finally { controller?.destroy(); env.restore(); }
});

test('reduced motion can reveal the predominant stationary item without forced alignment', () => withBrowser({ reduced: true, position: 650 }, env => {
  env.waitForState('waiting'); env.advance(2016);
  assert.deepEqual(env.visible(), [1]); assert.equal(env.scrollWrites, 0);
}));

test('visibility and BFCache restoration require fresh settlement and delay', () => withBrowser({}, env => {
  env.advance(2500); assert.deepEqual(env.visible(), [0]);
  env.visibility('hidden'); env.advance(4000); assert.deepEqual(env.visible(), []);
  env.visibility('visible'); env.waitForState('waiting');
  env.advance(1999); assert.deepEqual(env.visible(), []);
  env.advance(17); assert.deepEqual(env.visible(), [0]);
  env.win.emit('pagehide', { persisted: true }); env.advance(4000); assert.deepEqual(env.visible(), []);
  env.win.emit('pageshow', { persisted: true }); env.waitForState('waiting');
  env.advance(1999); assert.deepEqual(env.visible(), []);
  env.advance(17); assert.deepEqual(env.visible(), [0]);
}));

test('resize invalidates pending captions and controller never writes scrolling', () => withBrowser({}, env => {
  env.waitForState('waiting'); env.advance(1800); env.resize();
  env.advance(300); assert.deepEqual(env.visible(), []);
  env.advance(2200); assert.deepEqual(env.visible(), [0]);
  env.scroll(1000); env.scrollEnd(); env.advance(2500);
  assert.deepEqual(env.visible(), [1]); assert.equal(env.scrollWrites, 0);
}));

test('destroy cancels work, removes listeners and restores prior DOM attributes', () => {
  const env = browser(); let controller;
  try {
    env.container.setAttribute('data-fade-scroll', 'previous');
    env.container.setAttribute('data-fade-scroll-state', 'previous-state');
    controller = createFadeScroll(env.container); env.waitForState('waiting');
    controller.destroy(); controller.destroy();
    assert.equal(env.listenerCount(), 0);
    assert.equal(env.container.getAttribute('data-fade-scroll'), 'previous');
    assert.equal(env.container.getAttribute('data-fade-scroll-state'), 'previous-state');
    env.advance(10000); assert.deepEqual(env.visible(), []);
    assert.equal(env.scrollWrites, 0);
  } finally { controller?.destroy(); env.restore(); }
});
