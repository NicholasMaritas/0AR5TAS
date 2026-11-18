import test from 'node:test';
import assert from 'node:assert/strict';
import {LoopMotion, mod, rowOffset, rowOpacity, springStep} from './motion.js';

const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

function finish(motion, {start = 0, max = 10000, visit = () => {}} = {}) {
  let now = start;
  for (let elapsed = 0; elapsed < max; elapsed += 16) {
    now += 16;
    const active = motion.frame(16, now);
    visit(motion, now);
    if (!active) return now;
  }
  assert.fail(`motion did not settle: ${motion.mode}, ${motion.position}, ${motion.velocity}`);
}

test('Home is centered, next destination is above, and last destination is below', () => {
  assert.equal(rowOffset(0, 0, 7), 0);
  assert.equal(rowOffset(1, 0, 7), -1);
  assert.equal(rowOffset(6, 0, 7), 1);
  assert.equal(rowOpacity(0), 1);
  near(rowOpacity(-1), .28);
  near(rowOpacity(1), .28);
  assert(rowOpacity(.4) > rowOpacity(.8), 'focus fades gradually with distance');
});

test('every destination wraps in both directions without a visible boundary reset', () => {
  for (const position of [-7000.31, -21.2, -7, -.001, 0, 6.999, 7, 35.7, 7000.31]) {
    for (let index = 0; index < 7; index++) {
      near(rowOffset(index, position, 7), rowOffset(index, position + 7 * 250, 7), 1e-9);
      near(rowOffset(index, position, 7), rowOffset(index, position - 7 * 250, 7), 1e-9);
    }
  }
  // The real link which crosses the center is continuous across Home's cycle.
  near(rowOffset(0, 7 - .001, 7), -.001);
  near(rowOffset(0, 7 + .001, 7), .001);
  for (let cycle = -100; cycle <= 100; cycle++) {
    assert.equal(mod(cycle * 7, 7), 0);
    assert.equal(mod(cycle * 7 - 1, 7), 6);
  }
});

test('spring preserves initial position and velocity and is independent of frame partition', () => {
  const initial = springStep(2.3, -.008, 3, 0);
  near(initial.position, 2.3); near(initial.velocity, -.008);
  const whole = springStep(2.3, -.008, 3, 32);
  const half = springStep(2.3, -.008, 3, 16);
  const halves = springStep(half.position, half.velocity, 3, 16);
  near(whole.position, halves.position);
  near(whole.velocity, halves.velocity);
  const tiny = springStep(2.3, -.008, 3, .0001);
  near((tiny.position - 2.3) / .0001, -.008, 1e-7);
});

test('faster flick travels farther, decelerates gradually, then aligns exactly', () => {
  function flick(velocity) {
    const motion = new LoopMotion(7);
    motion.drag(.2, velocity); motion.release();
    let farthest = motion.position, priorSpeed = Math.abs(velocity);
    finish(motion, {visit(current) {
      farthest = Math.max(farthest, current.position);
      if (current.mode === 'coast') {
        assert(Math.abs(current.velocity) < priorSpeed);
        assert(Math.abs(current.velocity) > 0);
        priorSpeed = Math.abs(current.velocity);
      }
    }});
    assert.equal(motion.mode, 'idle');
    assert.equal(motion.position % 1, 0);
    assert.equal(motion.velocity, 0);
    return farthest;
  }
  assert(flick(.03) > flick(.004) + 3, 'fast flick should cross several more rows');
});

test('coasting enters final alignment without dropping its remaining velocity', () => {
  const motion = new LoopMotion(7);
  motion.position = .41; motion.velocity = .00121; motion.mode = 'coast';
  const expectedVelocity = .00121 * Math.exp(-16 / 210);
  const expectedPosition = .41 + .00121 * 210 * (1 - Math.exp(-16 / 210));
  motion.frame(16, 16);
  assert.equal(motion.mode, 'snap');
  near(motion.position, expectedPosition);
  near(motion.velocity, expectedVelocity);
  finish(motion, {start:16});
  assert.equal(motion.index, 0);
});

test('wheel input follows delivered deltas and aligns without a second coast', () => {
  const motion = new LoopMotion(7);
  motion.wheel(1.4, 0);
  assert.equal(motion.position, 0, 'wheel motion starts smoothly, without a direct position jump');
  for (let now = 16; now <= 96; now += 16) {
    motion.frame(16, now);
    motion.wheel(.5, now);
  }
  const deliveredTarget = motion.target;
  assert(deliveredTarget > 4);
  finish(motion, {start:96, visit(current) {
    assert.notEqual(current.mode, 'coast', 'trackpad deltas must not get another momentum tail');
    assert(current.position <= deliveredTarget + .05);
  }});
  assert.equal(motion.index, mod(Math.round(deliveredTarget), 7));
  assert.equal(motion.velocity, 0);
});

test('new dragging immediately interrupts both coasting and snapping', () => {
  for (const mode of ['coast', 'snap', 'wheel']) {
    const motion = new LoopMotion(7);
    motion.position = 2.4; motion.velocity = .03; motion.target = 5; motion.mode = mode;
    motion.stop(); motion.drag(-.3, -.006);
    near(motion.position, 2.1);
    near(motion.velocity, -.006);
    assert.equal(motion.mode, 'drag');
    assert.equal(motion.frame(16, 16), false, 'old animation does not continue during direct drag');
    near(motion.position, 2.1);
  }
});

test('arrow selection follows the visible direction and cycles through all seven destinations', () => {
  const motion = new LoopMotion(7, {reduced:true});
  for (let step = 1; step <= 21; step++) {
    motion.choose(1);
    assert.equal(motion.index, step % 7, 'up selects the next item which was above');
  }
  motion.choose(-1);
  assert.equal(motion.index, 6, 'down from Home selects the last item below');
});

test('reduced motion snaps immediately without an inertial or alignment animation', () => {
  const motion = new LoopMotion(7, {reduced:true});
  motion.drag(2.3, .04); motion.release();
  assert.equal(motion.position, 2);
  assert.equal(motion.mode, 'idle');
  assert.equal(motion.velocity, 0);
  motion.wheel(-3, 0);
  assert.equal(motion.index, 6);
  assert.equal(motion.mode, 'idle');
  motion.choose(1);
  assert.equal(motion.index, 0);
});

test('small reduced-motion wheel deltas accumulate within a gesture without animation', () => {
  const motion = new LoopMotion(7, {reduced:true});
  for (let step = 0; step < 12; step++) {
    motion.wheel(.05, step * 16);
    assert.equal(motion.mode, 'idle');
    assert.equal(motion.velocity, 0);
  }
  assert.equal(motion.index, 1, 'sub-row trackpad deltas eventually select the next row');
  near(motion.target, .6);
  // A separate gesture starts at the rendered row instead of reusing stale
  // fractional input from the previous stream.
  motion.wheel(-.1, 500);
  near(motion.target, .9);
  assert.equal(motion.index, 1);
});

test('large positions rebase by whole cycles without changing rendered rows or losing finite values', () => {
  for (const position of [-7 * 100001 - .3, 7 * 100001 + .3]) {
    const motion = new LoopMotion(7);
    motion.position = position; motion.target = position + .4; motion.mode = 'drag';
    const before = Array.from({length:7}, (_, index) => rowOffset(index, position, 7));
    motion.frame(16, 16);
    assert(Math.abs(motion.position) < 7);
    for (let index = 0; index < 7; index++) near(rowOffset(index, motion.position, 7), before[index], 1e-8);
    near(motion.target - motion.position, .4, 1e-8);
    assert(Number.isFinite(motion.position));
  }
});

test('reset discards previous movement and always returns to Home', () => {
  const motion = new LoopMotion(7);
  motion.wheel(20, 0); motion.frame(16, 16); motion.reset();
  assert.equal(motion.position, 0);
  assert.equal(motion.target, 0);
  assert.equal(motion.velocity, 0);
  assert.equal(motion.index, 0);
  assert.equal(motion.mode, 'idle');
});

test('rapid arrow repeats accumulate before animation has crossed the next row', () => {
  const motion = new LoopMotion(7);
  for (let step = 0; step < 8; step++) motion.choose(1);
  assert.equal(motion.target, 8);
  for (let time = 16; time < 3000 && motion.mode !== 'idle'; time += 16) motion.frame(16, time);
  assert.equal(motion.index, 1);
  assert.equal(motion.mode, 'idle');
});
