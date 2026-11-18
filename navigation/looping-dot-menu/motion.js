// Fractional row position. Positive motion brings the item ABOVE into the center.
export const mod = (value, count) => ((value % count) + count) % count;
export function rowOffset(index, position, count) {
  return mod(position - index + count / 2, count) - count / 2;
}
export function rowOpacity(offset) {
  return Math.max(0, 1 - Math.min(1, Math.abs(offset)) * .72);
}
export function springStep(position, velocity, target, elapsed, omega = .022) {
  const displacement = position - target;
  const c = velocity + omega * displacement;
  const decay = Math.exp(-omega * elapsed);
  return {position: target + (displacement + c * elapsed) * decay,
    velocity: (velocity - omega * c * elapsed) * decay};
}

export class LoopMotion {
  constructor(count, {reduced = false} = {}) {
    this.count = count; this.reduced = reduced; this.reset();
  }
  reset() {
    this.position = 0; this.velocity = 0; this.target = 0;
    this.mode = 'idle'; this.lastWheel = -Infinity;
  }
  stop() { this.velocity = 0; this.target = this.position; this.mode = 'idle'; }
  drag(delta, velocity) {
    this.position += delta; this.velocity = velocity; this.mode = 'drag';
  }
  release() {
    if (this.reduced) return this.settleImmediately();
    this.mode = Math.abs(this.velocity) > .0012 ? 'coast' : 'snap';
    this.target = Math.round(this.position);
  }
  wheel(delta, now) {
    if (this.mode !== 'wheel' && !(this.reduced && now - this.lastWheel < 160)) {
      this.target = this.position; this.velocity = 0;
    }
    this.target += delta; this.lastWheel = now; this.mode = 'wheel';
    if (this.reduced) { this.position = Math.round(this.target); this.velocity = 0; this.mode = 'idle'; }
  }
  choose(direction) {
    this.target = (this.mode === 'snap' ? this.target : Math.round(this.position)) + direction;
    this.mode = 'snap';
    if (this.reduced) this.settleImmediately(this.target);
  }
  settleImmediately(position = Math.round(this.position)) {
    this.position = mod(position, this.count); this.target = this.position;
    this.velocity = 0; this.mode = 'idle';
  }
  frame(elapsed, now) {
    const dt = Math.min(32, Math.max(0, elapsed));
    if (this.mode === 'coast') {
      const decay = Math.exp(-dt / 210);
      this.position += this.velocity * 210 * (1 - decay);
      this.velocity *= decay;
      if (Math.abs(this.velocity) < .0012) {
        this.target = Math.round(this.position); this.mode = 'snap';
      }
    } else if (this.mode === 'wheel' || this.mode === 'snap') {
      const next = springStep(this.position, this.velocity, this.target, dt);
      this.position = next.position; this.velocity = next.velocity;
      // Trackpads already supply momentum. Smooth their delivered deltas, without
      // generating a second inertial tail. Align only after their stream slows.
      if (this.mode === 'wheel' && now - this.lastWheel > 120 && Math.abs(this.velocity) < .0012) {
        this.target = Math.round(this.target); this.mode = 'snap';
      }
      if (this.mode === 'snap' && Math.abs(this.position - this.target) < .0005 && Math.abs(this.velocity) < .00003) {
        this.settleImmediately(this.target);
      }
    }
    if (Math.abs(this.position) > this.count * 10000) {
      const shift = Math.trunc(this.position / this.count) * this.count;
      this.position -= shift; this.target -= shift;
    }
    return this.mode !== 'idle' && this.mode !== 'drag';
  }
  get index() { return mod(Math.round(this.position), this.count); }
}
