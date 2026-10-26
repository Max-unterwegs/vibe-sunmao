/**
 * 关卡四：弧形锁死术 —— 楔钉榫
 * 两段弧形扶手半搭接，一根锥形硬木楔钉自上而下贯穿孔洞，锁死接缝。
 */
import { mergeGeos, extrudeY, extrudeZ, sweepArc } from '../geometry/shapes.js';
import { makePiece, DEG } from './common.js';

const R = 3.2;
const CZ = -0.4;
const Z_JOINT = 2.8;
const A_END = Math.acos(-0.4 / R); // 左侧弧木收于 x = -0.4
const B_END = Math.acos(0.4 / R);

export const meta = {
  id: 'wedge',
  cameraDir: [0.32, 0.5, 1.0],
  bias: 0.3,
  steps: [
    { id: 'lap', label: '自上而下，搭接两段弧木', piece: 'armB', type: 'insert' },
    { id: 'pin', label: '插入楔钉，锁死弧形接缝', piece: 'pin', type: 'insert' },
  ],
};

export function create(materials) {
  const pieces = [];
  const plateOutline = [
    [-0.4, 2.58],
    [0.4, 2.58],
    [0.4, 3.02],
    [-0.4, 3.02],
  ];
  const hole = [
    [-0.11, 2.64],
    [0.11, 2.64],
    [0.11, 2.96],
    [-0.11, 2.96],
  ];

  // 左段：整高弧木 + 下半厚搭接舌板
  const armA = sweepArc({
    cx: 0, cz: CZ, r: R,
    a0: A_END, a1: 135 * DEG,
    width: 0.42, height: 0.5, y0: 0, segments: 30,
  });
  const plateA = extrudeY(plateOutline, 0.25, 0, [hole], 0.006);
  pieces.push(makePiece(materials, {
    id: 'armA', label: '左段扶手 · 下半搭接', wood: 'rosewood',
    geo: mergeGeos([armA, plateA]),
    target: [0, 0, 0], explode: [-1.5, 0, 0],
  }));

  // 右段：整高弧木 + 上半厚搭接舌板（自上而下扣合）
  const armB = sweepArc({
    cx: 0, cz: CZ, r: R,
    a0: 45 * DEG, a1: B_END,
    width: 0.42, height: 0.5, y0: 0, segments: 30,
  });
  const plateB = extrudeY(plateOutline, 0.25, 0.25, [hole], 0.006);
  pieces.push(makePiece(materials, {
    id: 'armB', label: '右段扶手 · 上半搭接', wood: 'rosewood',
    geo: mergeGeos([armB, plateB]),
    target: [0, 0, 0],
    start: [0, 1.15, 0],
    draggable: true,
    explode: [1.5, 0.2, 0],
    step: 'lap',
  }));

  // 楔钉：上宽下窄的锥形硬木钉
  const pinProfile = [
    [-0.115, 0.7],
    [0.115, 0.7],
    [0.09, 0.6],
    [0.055, -0.06],
    [-0.055, -0.06],
    [-0.09, 0.6],
  ];
  const pinGeo = extrudeZ(pinProfile, 0.3, 0.012);
  pinGeo.translate(0, 0, Z_JOINT);
  pieces.push(makePiece(materials, {
    id: 'pin', label: '楔钉 · 上宽下窄', wood: 'walnut',
    geo: pinGeo,
    target: [0, 0, 0],
    start: [0, 1.8, 0],
    draggable: true,
    locked: true,
    explode: [0, 1.3, 0],
    step: 'pin',
  }));

  return { pieces };
}
