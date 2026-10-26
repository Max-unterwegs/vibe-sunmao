/**
 * 关卡三：抗扭转结构 —— 格肩榫
 * 立木中部开 45° 卯口与榫眼，两侧贴板收口；横枨端部做 45° 格肩，垂直推入后肩部贴实。
 */
import { extrudeZ, roundedBox } from '../geometry/shapes.js';
import { makePiece } from './common.js';

export const meta = {
  id: 'miter',
  cameraDir: [0.82, 0.4, 1.0],
  bias: 0.35,
  steps: [
    { id: 'align', label: '对准 T 型节点与 45° 卯口', piece: 'rail', type: 'near', dist: 1.3 },
    { id: 'insert', label: '垂直推入，让格肩咬合', piece: 'rail', type: 'insert' },
  ],
};

export function create(materials) {
  const pieces = [];

  // 立木中层截面（XY）：矩形 + 45° 卯口 + 榫眼（z 方向仅 0.5 厚，形成真正的卯口凹槽）
  const postProfile = [
    [0.1, -1.75],
    [1.0, -1.75],
    [1.0, 1.65],
    [0.1, 1.65],
    [0.1, 0.44],
    [0.32, 0.22],
    [0.96, 0.22],
    [0.96, -0.22],
    [0.32, -0.22],
    [0.1, -0.44],
  ];
  pieces.push(makePiece(materials, {
    id: 'post', label: '腿足 · 开 45° 卯口', wood: 'elm',
    geo: extrudeZ(postProfile, 0.5, 0.01),
    target: [0, 0, 0], explode: [1.0, 0, 0],
  }));
  pieces.push(makePiece(materials, {
    id: 'postFront', label: '腿足 · 贴板', wood: 'elm',
    geo: roundedBox(0.9, 3.4, 0.1, 0.01),
    target: [0.55, -0.05, 0.295], explode: [1.0, 0, 0.5],
  }));
  pieces.push(makePiece(materials, {
    id: 'postBack', label: '腿足 · 贴板', wood: 'elm',
    geo: roundedBox(0.9, 3.4, 0.1, 0.01),
    target: [0.55, -0.05, -0.295], explode: [1.0, 0, -0.5],
  }));

  // 横枨：45° 格肩 + 榫头（顺纹），整体由侧视轮廓挤出
  const railProfile = [
    [-2.0, -0.44],
    [0.096, -0.44],
    [0.316, -0.22],
    [0.956, -0.22],
    [0.956, 0.22],
    [0.316, 0.22],
    [0.096, 0.44],
    [-2.0, 0.44],
  ];
  pieces.push(makePiece(materials, {
    id: 'rail', label: '横枨 · 45° 格肩', wood: 'walnut',
    geo: extrudeZ(railProfile, 0.48, 0.012),
    target: [0, 0, 0],
    start: [-1.85, 0, 0],
    draggable: true,
    explode: [-1.5, 0.9, 0.7],
    step: 'insert',
  }));

  return { pieces };
}
