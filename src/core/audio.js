/**
 * 程序化木质音效（WebAudio）：无任何音频文件依赖。
 * 所有声音在首次用户手势后解锁。
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = false;
    this.supported = true;
  }

  unlock() {
    if (!this.supported) return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.supported = false; return; }
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    // 轻微高通，去掉低频轰鸣
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 45;
    this.master.connect(hp).connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 0.6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  setMuted(v) {
    this.muted = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v ? 0 : 0.5, this.ctx.currentTime, 0.04);
    }
  }

  get ready() { return !!this.ctx && !this.muted; }

  _now() { return this.ctx.currentTime; }

  _noise(dur = 0.2, freq = 800, q = 1.4, gain = 0.3, type = 'bandpass') {
    if (!this.ready) return;
    const t = this._now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  _tone(freq, dur, gain = 0.12, type = 'sine', when = 0, slideTo = null) {
    if (!this.ready) return;
    const t = this._now() + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  /** 木头敲击 */
  knock(power = 1) {
    if (!this.ready) return;
    this._noise(0.14, 520 * power + 180, 1.1, 0.34 * power);
    this._tone(176 * power, 0.14, 0.22 * power, 'sine', 0, 92);
    this._noise(0.05, 2400, 0.9, 0.08 * power);
  }

  /** 拖动时的摩擦 */
  slide(power = 0.4) {
    if (!this.ready) return;
    this._noise(0.12, 1100 + Math.random() * 500, 0.8, 0.05 * power, 'bandpass');
  }

  /** 吸附成功 */
  snap() {
    if (!this.ready) return;
    this.knock(1.15);
    this._tone(880, 0.22, 0.05, 'triangle', 0.02);
    this._tone(1320, 0.18, 0.03, 'sine', 0.05);
  }

  /** 楔钉锁死 */
  lock() {
    if (!this.ready) return;
    this.knock(0.9);
    this._noise(0.1, 700, 1.6, 0.2);
    this._tone(120, 0.3, 0.24, 'sine', 0.03, 60);
    this._tone(1600, 0.08, 0.04, 'square', 0.06);
  }

  /** 旋转到位 */
  tick() {
    if (!this.ready) return;
    this._noise(0.05, 1800, 2.0, 0.05);
    this._tone(660, 0.05, 0.025, 'triangle');
  }

  /** 关卡完成：五声音阶上行 */
  chime() {
    if (!this.ready) return;
    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    notes.forEach((f, i) => {
      this._tone(f, 1.4, 0.07 / (1 + i * 0.12), 'triangle', i * 0.095);
      this._tone(f * 2, 0.9, 0.018 / (1 + i * 0.15), 'sine', i * 0.095);
    });
  }

  ui() {
    if (!this.ready) return;
    this._tone(720, 0.06, 0.03, 'sine');
  }

  error() {
    if (!this.ready) return;
    this._tone(180, 0.16, 0.09, 'triangle', 0, 120);
    this._tone(140, 0.2, 0.06, 'sine', 0.06, 90);
  }

  whoosh(dur = 0.7) {
    if (!this.ready) return;
    const t = this._now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(320, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.45);
    f.frequency.exponentialRampToValueAtTime(300, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.1);
  }
}
