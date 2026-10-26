/**
 * 关卡二：防拉脱奇迹 —— 滑动燕尾榫（穿带）
 * 一块面板上开燕尾通槽，独根梯形穿带沿槽推入，端宽根窄，单向锁定。
 */
import { roundedBox, extrudeZ } from '../geometry/shapes.js';
import { makePiece } from './common.js';

export const meta = {
  id: 'dovetail',
  cameraDir: [0.42, 0.62, 0.78],
  bias: 0.35,
  steps: [
    { id: 'rotate', label: '旋转木料，与榫槽同向', piece: 'batten', type: 'rotate', tol: 8 },
    { id: 'insert', label: '沿槽推入，感受梯形锁死', piece: 'batten', type: 'insert' },
  ],
};

export function create(materials) {
  const pieces = [];

  // 面板：左、右两块带斜面的压边 + 底板，合成燕尾通槽
  const left = [
    [-1.6, 0.2],
    [-0.22, 0.2],
    [-0.30, -0.1],
    [-1.6, -0.1],
  ];
  const right = [
    [0.22, 0.2],
    [1.6, 0.2],
    [1.6, -0.1],
    [0.30, -0.1],
  ];
  pieces.push(makePiece(materials, {
    id: 'boardLeft', label: '面板 · 左压边', wood: 'beech',
    geo: extrudeZ(left, 1.9, 0.008),
    target: [0, 0, 0], explode: [-0.8, 0.25, 0],
  }));
  pieces.push(makePiece(materials, {
    id: 'boardRight', label: '面板 · 右压边', wood: 'beech',
    geo: extrudeZ(right, 1.9, 0.008),
    target: [0, 0, 0], explode: [0.8, 0.25, 0],
  }));
  pieces.push(makePiece(materials, {
    id: 'boardBase', label: '面板 · 底板', wood: 'beech',
    geo: roundedBox(3.2, 0.1, 1.9, 0.01),
    target: [0, -0.15, 0], explode: [0, -0.6, 0],
  }));

  // 穿带：梯形截面沿 Z 挤出，绕自身中心旋转
  const dovetail = [
    [-0.19, 0.14],
    [0.19, 0.14],
    [0.255, -0.14],
    [-0.255, -0.14],
  ];
  const geo = extrudeZ(dovetail, 2.9, 0.008);
  // 几何体以自身中心为轴，便于绕 Y 轴旋转微调
  pieces.push(makePiece(materials, {
    id: 'batten', label: '燕尾穿带', wood: 'walnut',
    geo,
    target: [0, 0.06, 0],
    start: [0, 0.06, 2.6],
    yaw: Math.PI / 4,
    rotatable: true,
    draggable: true,
    explode: [0, 1.4, 0],
    step: 'insert',
  }));

  return { pieces };
}

export const tolerance = { rotate: 8 * Math.PI / 180, snap: 0.36 };
