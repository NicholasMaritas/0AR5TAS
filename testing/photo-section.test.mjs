import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoSection} from './photo-section.js';

class Element extends EventTarget {
  children = []; attrs = new Map(); style = {}; dataset = {}; hidden = false;
  constructor(tag, document) { super(); this.tag = tag; this.ownerDocument = document; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  toggleAttribute(name, value) { if (value) this.attrs.set(name,''); else this.attrs.delete(name); }
  append(node) { this.children.push(node); }
  remove() { this.removed = true; }
}
function setup() {
  const calls = {focus:0, home:0};
  const video = {paused:false, pause() { this.paused = true; }};
  const listeners = new Map();
  const child = {
    getElementById:() => ({}), querySelectorAll:() => [video],
    addEventListener:(name, fn) => listeners.set(name, fn),
    removeEventListener:(name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const doc = {baseURI:'https://example.test/0AR5TAS/testing/', activeElement:null,
    createElement(tag) { const node = new Element(tag, doc); if (tag === 'iframe') node.contentDocument = child; return node; },
  };
  const root = new Element('main', doc);
  const section = createPhotoSection(root, {onHome:() => calls.home++, returnFocus:() => calls.focus++});
  const panel = root.children[0];
  const frame = () => panel.children.find(x => x.tag === 'iframe');
  return {section,panel,frame,video,child,listeners,doc,calls};
}

test('frame loads lazily once and keeps its document across selections', () => {
  const x = setup(); assert.equal(x.frame(),undefined);
  x.section.setActive(true); const frame = x.frame(); frame.dispatchEvent(new Event('load'));
  x.section.setActive(false); x.section.setActive(true);
  assert.equal(x.frame(),frame); assert.equal(frame.inert,false);
  assert.match(frame.src,/embed=testing/);
});

test('hiding pauses frame media and returns focus before making it inert', () => {
  const x = setup(); x.section.setActive(true); x.frame().dispatchEvent(new Event('load'));
  x.doc.activeElement = x.frame(); x.section.setActive(false);
  assert.equal(x.calls.focus,1); assert.equal(x.video.paused,true); assert.equal(x.frame().inert,true);
});

test('a delayed play callback cannot restart hidden frame media', () => {
  const x = setup(); x.section.setActive(true); x.frame().dispatchEvent(new Event('load'));
  x.section.setActive(false); x.video.paused = false;
  x.listeners.get('play')({target:x.video}); assert.equal(x.video.paused,true);
});

test('load completion after leaving cannot reactivate the library', () => {
  const x = setup(); x.section.setActive(true); x.section.setActive(false);
  x.frame().dispatchEvent(new Event('load'));
  assert.equal(x.frame().inert,true); assert.equal(x.panel.attrs.get('aria-hidden'),'true');
  assert.equal(x.video.paused,true);
});

test('only Home is intercepted, preserving the viewer Back control', () => {
  const x = setup(); x.section.setActive(true); x.frame().dispatchEvent(new Event('load'));
  let prevented = false;
  const event = match => ({target:{closest:() => match},preventDefault:() => prevented=true,stopImmediatePropagation() {}});
  x.listeners.get('click')(event(null)); assert.equal(prevented,false);
  x.listeners.get('click')(event({})); assert.equal(prevented,true); assert.equal(x.calls.home,1);
});

test('teardown pauses media and removes the frame bridge', () => {
  const x = setup(); x.section.setActive(true); x.frame().dispatchEvent(new Event('load'));
  x.section.destroy(); x.section.destroy();
  assert.equal(x.listeners.size,0); assert.equal(x.panel.removed,true); assert.equal(x.video.paused,true);
});

test('destroy before load prevents late document listeners', () => {
  const x = setup(); x.section.setActive(true); x.section.destroy();
  x.frame().dispatchEvent(new Event('load')); assert.equal(x.listeners.size,0);
});
