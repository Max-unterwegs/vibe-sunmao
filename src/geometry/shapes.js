/**
 * 榫卯几何工具箱
 * 所有构件都是「精确的实木体块」：圆角盒、按侧视图挤出的异形榫头、
 * 沿弧线扫掠的圆弧扶手、带孔洞的半搭接板。
 */
import { RoundedBoxGeometry } from '../../vendor/addons/RoundedBoxGeometry.js';
import {
  BufferGeometry,
  BufferAttribute,
  EdgesGeometry,
  ExtrudeGeometry,
  LineSegments,
  Path,
  Shape,
  Mesh,
  Vector3,
} from '../three.js';

/** 圆角木料（半径自动收敛，避免几何非法） */
export function roundedBox(w, h, d, r = 0.012) {
  const rr = Math.max(0.001, Math.min(r, Math.min(w, h, d) / 2 - 0.002));
  return new RoundedBoxGeometry(w, h, d, 2, rr);
}

export function shapeFrom(points) {
  const s = new Shape();
  points.forEach((p, i) => {
    if (i === 0) s.moveTo(p[0], p[1]);
    else s.lineTo(p[0], p[1]);
  });
  s.closePath();
  return s;
}

function extrudeRaw(shape, depth, bevel) {
  const b = bevelOf(depth, bevel);
  return new ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - 2 * b),
    bevelEnabled: b > 0.0005,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 2,
    steps: 1,
  });
}

function bevelOf(depth, bevel) {
  return Math.min(bevel, Math.max(0.001, depth / 4));
}

/** 侧视图轮廓（XY）→ 沿 Z 挤出并居中（用于立木、横枨的异形榫肩） */
export function extrudeZ(points, depth, bevel = 0.01) {
  const b = bevelOf(depth, bevel);
  const geo = extrudeRaw(shapeFrom(points), depth, bevel);
  geo.translate(0, 0, -depth / 2 + b);
  geo.computeVertexNormals();
  return geo;
}

/** 截面轮廓（ZY）→ 沿 X 挤出，x 从 x0 到 x0+length（可带通孔，用于卯眼） */
export function extrudeX(pointsZY, length, x0, holes = [], bevel = 0.008) {
  const shape = shapeFrom(pointsZY);
  for (const hole of holes) {
    const path = new Path();
    hole.forEach(([z, y], i) => {
      if (i === 0) path.moveTo(z, y);
      else path.lineTo(z, y);
    });
    path.closePath();
    shape.holes.push(path);
  }
  const b = bevelOf(length, bevel);
  const geo = extrudeRaw(shape, length, bevel);
  geo.rotateY(-Math.PI / 2);
  geo.translate(x0 + length - b, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

/** 俯视轮廓（XZ）→ 沿 Y 挤出，y 从 y0 到 y0+thickness（可带孔洞） */
export function extrudeY(pointsXZ, thickness, y0, holes = [], bevel = 0.006) {
  const shape = shapeFrom(pointsXZ.map(([x, z]) => [x, -z]));
  for (const hole of holes) {
    const path = new Path();
    hole.forEach(([x, z], i) => {
      if (i === 0) path.moveTo(x, -z);
      else path.lineTo(x, -z);
    });
    path.closePath();
    shape.holes.push(path);
  }
  const b = bevelOf(thickness, bevel);
  const geo = extrudeRaw(shape, thickness, bevel);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0 + b, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 沿水平圆弧扫掠矩形截面（圆椅扶手 / 弧形构件）
 * cx, cz: 圆心；r: 半径；a0→a1: 弧度；width: 径向宽；height: 竖向高；y0: 底面高度
 */
export function sweepArc({ cx = 0, cz = 0, r = 5, a0 = 0, a1 = Math.PI / 4, width = 0.42, height = 0.5, y0 = 0, segments = 28 }) {
  const hw = width / 2;
  const hh = height / 2;
  const up = new Vector3(0, 1, 0);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const n = Math.max(3, segments);
  const arcLen = Math.abs(a1 - a0) * r;

  // 每段 4 条「条带」：顶、底、外、内 —— 条带内部法线平滑，转角和弦向自然
  const strips = [];
  for (let k = 0; k < 4; k++) strips.push({ pos: [], nrm: [], uv: [] });

  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const px = cx + r * cos;
    const pz = cz + r * sin;
    const S = new Vector3(cos, 0, sin); // 径向朝外
    const c = (so, sy) => new Vector3(px + S.x * so, y0 + hh + sy, pz + S.z * so);
    const dist = arcLen * t;
    // 顺序：右上、左上、左下、右下（从 +T 方向看为逆时针）
    const corners = [
      { p: c(hw, hh), n: up, u: dist, v: 1 },
      { p: c(-hw, hh), n: up, u: dist, v: 0 },
      { p: c(-hw, -hh), n: new Vector3(-up.x, -1, -up.z), u: dist, v: 0 },
      { p: c(hw, -hh), n: new Vector3(up.x, -1, up.z), u: dist, v: 1 },
    ];
    // 顶 / 底
    strips[0].pos.push(corners[0].p, corners[1].p);
    strips[1].pos.push(corners[2].p, corners[3].p);
    // 外 / 内（外侧面从下往上绕，保证法线朝外）
    strips[2].pos.push(corners[3].p, corners[0].p);
    strips[3].pos.push(corners[1].p, corners[2].p);
    strips[0].nrm.push(up, up);
    strips[1].nrm.push(corners[2].n, corners[3].n);
    strips[2].nrm.push(S, S);
    strips[3].nrm.push(S.clone().negate(), S.clone().negate());
    strips[0].uv.push(new Vector3(corners[0].u, 1, 0), new Vector3(corners[1].u, 0, 0));
    strips[1].uv.push(new Vector3(corners[2].u, 0, 0), new Vector3(corners[3].u, 1, 0));
    strips[2].uv.push(new Vector3(corners[3].u, 0, 0), new Vector3(corners[0].u, 1, 0));
    strips[3].uv.push(new Vector3(corners[1].u, 1, 0), new Vector3(corners[2].u, 0, 0));
  }

  let base = 0;
  const addStrip = (strip) => {
    const start = base;
    for (let i = 0; i < strip.pos.length; i++) {
      positions.push(strip.pos[i].x, strip.pos[i].y, strip.pos[i].z);
      normals.push(strip.nrm[i].x, strip.nrm[i].y, strip.nrm[i].z);
      uvs.push(strip.uv[i].x / 0.9, strip.uv[i].y);
    }
    base += strip.pos.length;
    for (let i = 0; i < n; i++) {
      const a = start + i * 2;
      const b = a + 1;
      const c2 = a + 3;
      const d = a + 2;
      indices.push(a, b, c2, a, c2, d);
    }
  };
  strips.forEach(addStrip);

  // 两端封盖
  const aStart = a0;
  const aEnd = a1;
  const caps = [
    { a: aStart, sign: -1 },
    { a: aEnd, sign: 1 },
  ];
  for (const cap of caps) {
    const cos = Math.cos(cap.a);
    const sin = Math.sin(cap.a);
    const px = cx + r * cos;
    const pz = cz + r * sin;
    const S = new Vector3(cos, 0, sin);
    const nrm = new Vector3(-sin, 0, cos).multiplyScalar(cap.sign);
    const start = base;
    const quad = [
      [hw, hh], [-hw, hh], [-hw, -hh], [hw, -hh],
    ];
    quad.forEach(([so, sy]) => {
      positions.push(px + S.x * so, y0 + hh + sy, pz + S.z * so);
      normals.push(nrm.x, nrm.y, nrm.z);
      uvs.push((so + hw) / width, (sy + hh) / height);
    });
    base += 4;
    if (cap.sign > 0) {
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    } else {
      indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/** 合并若干几何体（统一为非索引，保留 position/normal/uv） */
export function mergeGeos(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = ['position', 'normal'];
  const out = new BufferGeometry();
  for (const name of names) {
    let total = 0;
    for (const g of parts) total += g.attributes[name] ? g.attributes[name].array.length : 0;
    const arr = new Float32Array(total);
    let offset = 0;
    for (const g of parts) {
      const a = g.attributes[name];
      if (!a) continue;
      arr.set(a.array, offset);
      offset += a.array.length;
    }
    out.setAttribute(name, new BufferAttribute(arr, 3));
  }
  // uv 是 2 分量
  let uvTotal = 0;
  for (const g of parts) uvTotal += g.attributes.uv ? g.attributes.uv.array.length : 0;
  const uv = new Float32Array(uvTotal);
  let uo = 0;
  for (const g of parts) {
    const a = g.attributes.uv;
    if (!a) continue;
    uv.set(a.array, uo);
    uo += a.array.length;
  }
  out.setAttribute('uv', new BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

export function makeEdges(geometry, material, angle = 24) {
  const edges = new LineSegments(new EdgesGeometry(geometry, angle), material);
  edges.renderOrder = 2;
  return edges;
}

/** 生成一块木料：实体 + 轮廓线 */
export function woodMesh(geometry, material, edgeMaterial, name = '') {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (edgeMaterial) {
    const e = makeEdges(geometry, edgeMaterial);
    mesh.add(e);
    mesh.userData.edges = e;
  }
  return mesh;
}
