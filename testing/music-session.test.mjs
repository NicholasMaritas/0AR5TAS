import test from 'node:test';
import assert from 'node:assert/strict';
import {createMusicSession} from './music-session.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
function setup(load) {
  const calls = {mount:0, refresh:0, destroy:0, visible:[], failures:0};
  const track = {playing:true, time:42};
  const session = createMusicSession({load,
    mount:() => { calls.mount++; return {refresh:() => calls.refresh++, destroy:() => calls.destroy++, track}; },
    visible:value => calls.visible.push(value), failed:() => calls.failures++,
  });
  return {session, calls, track};
}

test('late load cannot reopen Music after selecting another section', async () => {
  const data = deferred(); const {session,calls} = setup(() => data.promise);
  const opening = session.setActive(true);
  await session.setActive(false); data.resolve({tracks:[]}); await opening;
  assert.equal(calls.mount,0); assert.equal(calls.visible.at(-1),false);
  await session.setActive(true); assert.equal(calls.mount,1);
});

test('rapid repeated activation shares one load and mounts once', async () => {
  const data = deferred(); let loads = 0;
  const {session,calls} = setup(() => { loads++; return data.promise; });
  const first = session.setActive(true), second = session.setActive(true);
  data.resolve({tracks:[]}); await Promise.all([first,second]);
  assert.equal(loads,1); assert.equal(calls.mount,1);
});

test('leaving and returning preserves the live player and track state', async () => {
  const {session,calls,track} = setup(async () => ({tracks:[]}));
  await session.setActive(true); await session.setActive(false); await session.setActive(true);
  assert.equal(calls.mount,1); assert.equal(calls.destroy,0);
  assert.deepEqual(track,{playing:true,time:42}); assert.equal(calls.refresh,2);
});

test('destroy during load prevents late mount and failure feedback', async () => {
  const data = deferred(); const {session,calls} = setup(() => data.promise);
  const first = session.setActive(true); session.destroy(); data.reject(new Error('offline')); await first;
  assert.equal(calls.mount,0); assert.equal(calls.failures,0);
});

test('failed catalogue can be retried by selecting Music again', async () => {
  let loads = 0;
  const {session,calls} = setup(async () => { if (!loads++) throw new Error('offline'); return {tracks:[]}; });
  await session.setActive(true); assert.equal(calls.failures,1);
  await session.setActive(true); assert.equal(calls.mount,1); assert.equal(loads,2);
});

test('a failure after leaving Music does not affect another section', async () => {
  const data = deferred(); const {session,calls} = setup(() => data.promise);
  const first = session.setActive(true); await session.setActive(false);
  data.reject(new Error('offline')); await first;
  assert.equal(calls.failures,0); assert.equal(calls.visible.at(-1),false);
});

test('page teardown destroys the mounted player once and ignores later activation', async () => {
  const {session,calls} = setup(async () => ({tracks:[]}));
  await session.setActive(true); session.destroy(); session.destroy(); await session.setActive(true);
  assert.equal(calls.mount,1); assert.equal(calls.destroy,1);
});
