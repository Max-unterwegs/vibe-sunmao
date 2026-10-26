/**
 * 关卡一：万榫之基 —— 直角透榫
 * 方柱上开一个贯穿的卯眼（一体成型），横枨带榫头穿入，榫头外露。
 */
import { extrudeX, extrudeZ } from '../geometry/shapes.js';
import { makePiece } from './common.js';

export const meta = {
  id: 'basic',
  cameraDir: [0.55, 0.34, 1.0],
  bias: 0.45,
  steps: [
    { id: 'align', label: '推出榫头，对准卯眼', piece: 'rail', type: 'near', dist: 1.15 },
    { id: 'insert', label: '推入到底，让榫肩贴紧', piece: 'rail', type: 'insert' },
  ],
};

export function create(materials) {
  const pieces = [];

  // 立柱：一整根木料，中间穿一个 0.36 × 0.36 的卯眼
  const postOutline = [
    [-0.45, -1.75],
    [0.45, -1.75],
    [0.45, 1.65],
    [-0.45, 1.65],
  ];
  const mortise = [
    [-0.18, -0.18],
    [0.18, -0.18],
    [0.18, 0.18],
    [-0.18, 0.18],
  ];
  pieces.push(makePiece(materials, {
    id: 'post', label: '立柱 · 贯穿卯眼', wood: 'elm',
    geo: extrudeX(postOutline, 0.9, -0.45, [mortise], 0.014),
    target: [0, 0, 0],
    explode: [0, 0.9, 0],
  }));

  // 横枨 + 透榫：侧视图挤出，榫头顺纹而出
  const railProfile = [
    [-1.95, -0.31],
    [-0.45, -0.31],
    [-0.45, -0.17],
    [0.62, -0.17],
    [0.62, 0.17],
    [-0.45, 0.17],
    [-0.45, 0.31],
    [-1.95, 0.31],
  ];
  pieces.push(makePiece(materials, {
    id: 'rail', label: '透榫横枨', wood: 'walnut',
    geo: extrudeZ(railProfile, 0.62, 0.012),
    target: [0, 0, 0],
    start: [-1.4, 0, 0],
    draggable: true,
    explode: [-1.3, 0.85, 0.55],
    step: 'insert',
  }));

  return { pieces };
}
