/**
 * 轻量补间动画引擎
 * 不依赖 GSAP：项目里所有位移 / 旋转 / 数值动画都走这里，保证节奏统一。
 */

export const Ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export class Animator {
  constructor() {
    this.items = [];
    this.time = 0;
  }

  /** add({ dur, delay, ease, update(eased, raw), done }) → 返回句柄，可 .cancel() */
  add(opts) {
    const item = {
      t: 0,
      delay: opts.delay || 0,
      dur: Math.max(opts.dur ?? 0.5, 0.0001),
      ease: opts.ease || Ease.outCubic,
      update: opts.update || null,
      done: opts.done || null,
      dead: false,
      cancel: () => { item.dead = true; },
    };
    this.items.push(item);
    return item;
  }

  update(dt) {
    this.time += dt;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.dead) { this.items.splice(i, 1); continue; }
      if (it.delay > 0) { it.delay -= dt; if (it.delay > 0) continue; }
      it.t = Math.min(1, it.t + dt / it.dur);
      const e = it.ease(it.t);
      if (it.update) it.update(e, it.t);
      if (it.t >= 1) {
        this.items.splice(i, 1);
        if (it.done) it.done();
      }
    }
  }

  clear() {
    this.items.length = 0;
  }
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const wrapAngle = (a) => {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
};
/** 角度差（弧度），恒为正 */
export const angleDelta = (a, b) => Math.abs(wrapAngle(a - b));
