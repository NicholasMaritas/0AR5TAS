import test from 'node:test';
import assert from 'node:assert/strict';
import { createRadioController } from './radio-player.js';

class AudioFixture extends EventTarget {
  paused = true;
  ended = false;
  currentTime = 0;
  duration = NaN;
  src = '';
  requests = [];
  play() {
    this.paused = false;
    return new Promise((resolve, reject) => this.requests.push({ resolve, reject }));
  }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  load() { this.currentTime = 0; this.ended = false; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
}
const tracks = [{ audio_url: 'https://example.test/one.mp3' }, { audio_url: 'https://example.test/two.wav' }];
const setup = () => {
  const audio = new AudioFixture();
  const changes = [];
  const player = createRadioController(audio, tracks, s => changes.push(s), { initialIndex: 0 });
  return { audio, changes, player };
};

test('initial selection is paused and a new selection starts only the selected source', async () => {
  const { audio, player } = setup();
  assert.equal(audio.src, tracks[0].audio_url);
  assert.equal(player.getState().playing, false);
  const result = player.select(1);
  assert.equal(audio.src, tracks[1].audio_url);
  assert.equal(player.getState().selected, 1);
  assert.equal(audio.requests.length, 1);
  audio.requests[0].resolve(); await result;
  player.destroy();
});

test('collapse preserves playback and same-track selection pauses without reloading', async () => {
  const { audio, player } = setup();
  const result = player.play(); audio.requests[0].resolve(); await result;
  audio.currentTime = 20;
  player.toggleExpanded();
  assert.equal(player.getState().expanded, false);
  assert.equal(audio.paused, false);
  player.select(0);
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 20);
  player.destroy();
});

test('a late rejected play from the old track cannot stop the new track', async () => {
  const { audio, player } = setup();
  const oldPlay = player.play(); const newPlay = player.select(1);
  audio.requests[0].reject(new Error('old request interrupted'));
  await oldPlay;
  assert.equal(player.getState().selected, 1);
  assert.equal(player.getState().playing, true);
  assert.equal(player.getState().error, '');
  audio.requests[1].resolve(); await newPlay;
  player.destroy();
});

test('explicit pause wins over a pending play rejection', async () => {
  const { audio, player } = setup();
  const result = player.play(); player.pause();
  audio.requests[0].reject(new Error('aborted')); await result;
  assert.equal(player.getState().playing, false);
  assert.equal(player.getState().error, '');
  player.destroy();
});

test('autoplay rejection is handled and a user retry can recover', async () => {
  const { audio, player } = setup();
  const blocked = player.play();
  audio.requests[0].reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
  await blocked;
  assert.equal(player.getState().playing, false);
  assert.match(player.getState().error, /blocked/);
  const retry = player.play(); audio.requests[1].resolve(); await retry;
  assert.equal(player.getState().playing, true);
  assert.equal(player.getState().error, '');
  player.destroy();
});

test('invalid duration stays finite and ending stops without advancing to another mix', () => {
  const { audio, player } = setup();
  audio.currentTime = 25; audio.dispatchEvent(new Event('timeupdate'));
  assert.equal(player.getState().progress, 0);
  audio.duration = 100; audio.dispatchEvent(new Event('timeupdate'));
  assert.equal(player.getState().progress, 25);
  audio.ended = true; audio.dispatchEvent(new Event('ended'));
  assert.equal(player.getState().progress, 0);
  assert.equal(player.getState().playing, false);
  assert.equal(player.getState().selected, 0);
  player.destroy();
});

test('destroy releases the source and prevents late callbacks or control actions', async () => {
  const { audio, player, changes } = setup();
  const pending = player.play(); player.destroy();
  const count = changes.length;
  audio.requests[0].reject(new Error('removed')); await pending;
  audio.dispatchEvent(new Event('error')); audio.dispatchEvent(new Event('timeupdate'));
  player.select(1); await player.play(); player.pause(); player.toggleExpanded(); player.destroy();
  assert.equal(audio.src, '');
  assert.equal(audio.paused, true);
  assert.equal(changes.length, count);
});
