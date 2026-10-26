/**
 * 程序化木材 PBR 材质库
 * - 用「可平铺的周期值噪声」生成木纹高度场
 * - 由高度场派生：颜色贴图（多种木种）、法线贴图、粗糙度贴图
 * - 不依赖任何外部图片，完全离线可用
 */
import {
  CanvasTexture,
  SRGBColorSpace,
  NoColorSpace,
  RepeatWrapping,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  LineBasicMaterial,
  MeshBasicMaterial,
  Vector2,
  Color,
} from '../three.js';

const SIZE = 768;

/* ---------------- 周期噪声 ---------------- */
function hash(ix, iy, period, seed) {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  let n = Math.imul(px, 374761393) + Math.imul(py, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, period, seed);
  const b = hash(xi + 1, yi, period, seed);
  const c = hash(xi, yi + 1, period, seed);
  const d = hash(xi + 1, yi + 1, period, seed);
  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  return ab + (cd - ab) * v;
}

function fbm(x, y, period, seed, octaves = 3) {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let p = period;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(fx, fy, p, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    p = Math.max(2, Math.round(p * 2));
    fx *= 2;
    fy *= 2;
  }
  return sum / norm;
}

/* ---------------- 木纹高度场 ---------------- */
function buildField() {
  const h = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      // 顺纹方向（v）变化慢、横纹方向（u）变化快 → 拉长的木纤维
      const broad = fbm(u * 3, v * 0.55, 3, 7, 4);
      const streak = fbm(u * 8, v * 0.9, 8, 19, 3);
      const fine = fbm(u * 52, v * 3.2, 52, 31, 3);
      const pore = fbm(u * 190, v * 26, 190, 47, 2);
      const ring = Math.sin((u * 9 + broad * 2.4 + streak * 0.8) * Math.PI * 2);
      const val = 0.5
        + (broad - 0.5) * 0.30
        + (streak - 0.5) * 0.26
        + (fine - 0.5) * 0.16
        + (pore - 0.5) * 0.08
        + ring * 0.035;
      h[y * SIZE + x] = Math.min(1, Math.max(0, val));
    }
  }
  return h;
}

function canvas2d(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function textureOf(canvas, srgb, anisotropy) {
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

function rampColor(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      const k = (t - a[0]) / (b[0] - a[0] || 1);
      return [
        a[1][0] + (b[1][0] - a[1][0]) * k,
        a[1][1] + (b[1][1] - a[1][1]) * k,
        a[1][2] + (b[1][2] - a[1][2]) * k,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

function colorCanvas(field, stops) {
  const c = canvas2d(SIZE);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  const d = img.data;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const h = field[i];
    const t = Math.min(1, Math.max(0, (h - 0.27) / 0.5));
    const col = rampColor(stops, t);
    const grain = (hash(i & 1023, (i / 1024) | 0, 1024, 71) - 0.5) * 6;
    const o = i * 4;
    d[o] = Math.min(255, Math.max(0, col[0] + grain));
    d[o + 1] = Math.min(255, Math.max(0, col[1] + grain * 0.85));
    d[o + 2] = Math.min(255, Math.max(0, col[2] + grain * 0.7));
    d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function normalCanvas(field, strength = 2.2) {
  const c = canvas2d(SIZE);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  const d = img.data;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const xl = (x - 1 + SIZE) % SIZE;
      const xr = (x + 1) % SIZE;
      const yu = (y - 1 + SIZE) % SIZE;
      const yd = (y + 1) % SIZE;
      const dx = (field[y * SIZE + xr] - field[y * SIZE + xl]) * strength;
      const dy = (field[yd * SIZE + x] - field[yu * SIZE + x]) * strength;
      let nx = -dx;
      let ny = -dy;
      let nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const o = i * 4;
      d[o] = (nx * 0.5 + 0.5) * 255;
      d[o + 1] = (ny * 0.5 + 0.5) * 255;
      d[o + 2] = (nz * 0.5 + 0.5) * 255;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function roughnessCanvas(field) {
  const c = canvas2d(SIZE);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  const d = img.data;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const h = field[i];
    const x = i % SIZE;
    const y = (i / SIZE) | 0;
    const rough = 0.44 + (1 - h) * 0.24 + (hash(x, y, 1024, 91) - 0.5) * 0.05;
    const v = Math.min(255, Math.max(0, rough * 255));
    const o = i * 4;
    d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ---------------- 木种色阶 ---------------- */
export const PALETTES = {
  walnut: [
    [0, [58, 38, 26]],
    [0.5, [108, 71, 46]],
    [1, [162, 121, 82]],
  ],
  elm: [
    [0, [112, 73, 43]],
    [0.5, [168, 120, 76]],
    [1, [218, 178, 128]],
  ],
  beech: [
    [0, [148, 105, 66]],
    [0.5, [202, 158, 112]],
    [1, [238, 212, 174]],
  ],
  rosewood: [
    [0, [40, 20, 14]],
    [0.5, [94, 46, 31]],
    [1, [142, 80, 56]],
  ],
};

let cachedField = null;
let cachedNormal = null;
let cachedRough = null;

export function createWoodLibrary(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (!cachedField) {
    cachedField = buildField();
    cachedNormal = textureOf(normalCanvas(cachedField, 1.7), false, aniso);
    cachedRough = textureOf(roughnessCanvas(cachedField), false, aniso);
  }
  const materials = {};
  for (const [key, stops] of Object.entries(PALETTES)) {
    const map = textureOf(colorCanvas(cachedField, stops), true, aniso);
    materials[key] = new MeshPhysicalMaterial({
      map,
      normalMap: cachedNormal,
      normalScale: new Vector2(0.42, 0.42),
      roughnessMap: cachedRough,
      roughness: 1,
      metalness: 0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.5,
      color: new Color(0xffffff),
    });
  }

  // 黄铜 / 深色石台
  materials.brass = new MeshStandardMaterial({
    color: 0xb98d4e,
    metalness: 0.95,
    roughness: 0.3,
    envMapIntensity: 1.25,
  });
  materials.stone = new MeshStandardMaterial({
    color: 0x8b8178,
    roughness: 0.92,
    metalness: 0.02,
    map: makeStoneTexture(aniso),
    envMapIntensity: 0.4,
  });
  return materials;
}

function makeStoneTexture(aniso) {
  const S = 512;
  const c = canvas2d(S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const n = fbm(u * 6, v * 6, 6, 7, 4) * 0.6 + fbm(u * 28, v * 28, 28, 13, 3) * 0.4;
      const base = 108 + n * 40;
      const o = (y * S + x) * 4;
      d[o] = base * 1.02;
      d[o + 1] = base * 0.98;
      d[o + 2] = base * 0.92;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = aniso;
  t.repeat.set(3, 3);
  return t;
}

export function makeDustTexture() {
  const S = 64;
  const c = canvas2d(S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,246,225,1)');
  g.addColorStop(0.25, 'rgba(255,240,210,0.6)');
  g.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function makeEdgeMaterial() {
  return new LineBasicMaterial({
    color: 0x2c2017,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    userData: { disposable: true },
  });
}

export function makeGhostMaterial(color = 0xc9a05a) {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: 2,
  });
}

export function makeGhostEdgeMaterial(color = 0xd8b271) {
  return new LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
}

/** 展品在台面上的接触阴影（程序化径向渐变） */
export function makeShadowTexture() {
  const S = 256;
  const c = canvas2d(S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(36, 24, 14, 0.62)');
  g.addColorStop(0.42, 'rgba(36, 24, 14, 0.3)');
  g.addColorStop(0.75, 'rgba(36, 24, 14, 0.08)');
  g.addColorStop(1, 'rgba(36, 24, 14, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
