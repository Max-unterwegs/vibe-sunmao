import { Vector3 } from '../three.js';
import { makeEdgeMaterial } from '../core/wood.js';
import { woodMesh } from '../geometry/shapes.js';

/**
 * 创建构件。
 * geometry 直接以「装配完成时的世界坐标」建模；target 是构件在装配态的位移，
 * 便于爆炸视图与吸附。需要旋转微调的构件请让几何体以自身轴心建模。
 */
export function makePiece(materials, opts) {
  const {
    id, label = '', wood = 'walnut', geo,
    target = [0, 0, 0], start = null, yaw = 0,
    rotatable = false, draggable = false, explode = [0, 0, 0],
    step = null, locked = false, hidden = false,
  } = opts;
  const mesh = woodMesh(geo, materials[wood], makeEdgeMaterial(), id);
  const targetV = new Vector3(...target);
  const startV = start ? new Vector3(...start) : targetV.clone();
  const piece = {
    id,
    label,
    wood,
    mesh,
    target: targetV,
    start: startV,
    startYaw: yaw,
    targetYaw: 0,
    yaw,
    rotatable,
    draggable,
    explode: new Vector3(...explode),
    assembled: !draggable,
    step,
    locked,
    hidden,
    mode: 'drag',
  };
  mesh.position.copy(draggable ? startV : targetV);
  mesh.rotation.y = yaw;
  if (hidden) mesh.visible = false;
  mesh.userData.piece = piece;
  return piece;
}

export function centroid(pieces) {
  const v = new Vector3();
  for (const p of pieces) v.add(p.target);
  v.divideScalar(pieces.length || 1);
  return v;
}

export const DEG = Math.PI / 180;
