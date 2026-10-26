/**
 * 几何自检：不依赖浏览器，验证四关模型能正确构建、无 NaN、尺度合理。
 * 运行：node tools/check-geometry.mjs
 */
import { MeshBasicMaterial, Box3, Vector3 } from '../src/three.js';
import { LEVEL_DEFS } from '../src/levels/index.js';

const stub = new Proxy({}, { get: () => new MeshBasicMaterial() });
let failed = 0;

const expect = (cond, msg) => {
  if (!cond) {
    failed++;
    console.error('  ✗', msg);
  } else {
    console.log('  ✓', msg);
  }
};

for (const def of LEVEL_DEFS) {
  const { pieces } = def.create(stub);
  console.log(`\n[${def.meta.id}] ${def.info.name} · ${def.info.joint}`);
  expect(pieces.length >= 2, `构件数量 ${pieces.length}`);
  const ids = new Set();
  for (const p of pieces) {
    const geo = p.mesh.geometry;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    let bad = false;
    for (let i = 0; i < pos.array.length; i += 1) {
      if (!Number.isFinite(pos.array[i])) { bad = true; break; }
    }
    expect(!bad, `${p.id} 顶点数值有效（${pos.count} 顶点）`);
    expect(!!uv, `${p.id} 含 UV`);
    expect(!ids.has(p.id), `${p.id} id 唯一`);
    ids.add(p.id);
    geo.computeBoundingBox();
    const size = geo.boundingBox.getSize(new Vector3());
    expect(size.length() > 0.05 && size.length() < 12, `${p.id} 尺度合理 (${size.toArray().map((v) => v.toFixed(2)).join(', ')})`);
  }
  const drag = pieces.filter((p) => p.draggable);
  expect(drag.length >= 1, `存在可拖拽构件：${drag.map((p) => p.id).join(', ')}`);
  for (const p of drag) {
    expect(p.start.distanceTo(p.target) > 0.5, `${p.id} 拖拽行程 ${p.start.distanceTo(p.target).toFixed(2)}`);
  }
  expect(def.meta.steps.length >= 1, `步序 ${def.meta.steps.length} 条`);
  for (const step of def.meta.steps) {
    expect(pieces.some((p) => p.id === step.piece), `步序「${step.label}」指向存在的构件 ${step.piece}`);
  }
}

// 组装态整体包围盒（用于相机取景的自洽性检查）
console.log('\n— 装配态包围盒 —');
for (const def of LEVEL_DEFS) {
  const { pieces } = def.create(stub);
  const box = new Box3();
  for (const p of pieces) {
    const geo = p.mesh.geometry;
    geo.computeBoundingBox();
    const b = geo.boundingBox.clone().translate(p.target);
    box.union(b);
  }
  const size = box.getSize(new Vector3());
  console.log(`  ${def.meta.id}: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
  expect(size.x < 8 && size.y < 6, '装配体尺寸在展台范围内');
}

console.log(failed ? `\n${failed} 项未通过` : '\n全部通过');
process.exit(failed ? 1 : 0);
