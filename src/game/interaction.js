/**
 * 交互层：拾取、轴向拖拽、旋转微调、幽灵投影、吸附、辅助线、悬停高亮
 */
import * as THREE from '../three.js';
import { angleDelta, clamp, Ease, lerp, wrapAngle } from '../core/anim.js';
import { makeGhostEdgeMaterial, makeGhostMaterial } from '../core/wood.js';
import { makeEdges } from '../geometry/shapes.js';

const TMP_V1 = new THREE.Vector3();
const TMP_V2 = new THREE.Vector3();
const TMP_V3 = new THREE.Vector3();
const ROT_STEP = Math.PI / 12; // 15°

export class Interaction {
  constructor(stage, audio, callbacks = {}) {
    this.stage = stage;
    this.audio = audio;
    this.cb = callbacks;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pieces = [];
    this.ghosts = new Map();
    this.guides = new Map();
    this.overlay = new THREE.Group();
    this.stage.scene.add(this.overlay);
    this.dragging = null;
    this.hovered = null;
    this.active = null;
    this.enabled = true;
    this.guideVisible = false;
    this._lastSlide = 0;
    this._bind();
    this.stage.onTick((dt) => this.update(dt));
  }

  /* ------------------------------ 生命周期 ------------------------------ */
  setLevel(pieces) {
    this.clear();
    this.pieces = pieces;
    this.enabled = true;
    this.dragging = null;
    this.hovered = null;
    this.active = null;

    const ghostMat = makeGhostMaterial();
    const ghostEdge = makeGhostEdgeMaterial();

    for (const p of pieces) {
      if (!p.draggable) continue;
      const g = new THREE.Mesh(p.mesh.geometry, ghostMat.clone());
      g.position.copy(p.target);
      g.position.y += 0.0005;
      g.rotation.y = p.targetYaw;
      g.renderOrder = 3;
      g.visible = false;
      g.userData.ghost = true;
      this.overlay.add(g);
      const eg = makeEdges(p.mesh.geometry, ghostEdge.clone(), 30);
      eg.renderOrder = 4;
      g.add(eg);
      eg.visible = true;
      p.ghost = g;
      p.ghostEdge = eg;
      this.ghosts.set(p.id, g);

      // 辅助线：起点 → 目标的虚线 + 落位环 + 箭头
      const group = new THREE.Group();
      const dir = TMP_V1.copy(p.target).sub(p.start);
      const len = dir.length();
      dir.normalize();
      const lineGeo = new THREE.BufferGeometry().setFromPoints([p.start.clone(), p.target.clone()]);
      const line = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({
        color: 0xb08a4f,
        dashSize: 0.12,
        gapSize: 0.09,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }));
      line.computeLineDistances();
      group.add(line);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.17, 0.012, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0xc9a05a, transparent: true, opacity: 0.7, depthWrite: false }),
      );
      ring.position.copy(p.target);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      group.add(ring);

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.18, 12),
        new THREE.MeshBasicMaterial({ color: 0xc9a05a, transparent: true, opacity: 0.8, depthWrite: false }),
      );
      cone.position.copy(p.start).addScaledVector(dir, len * 0.55);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      group.add(cone);

      group.visible = false;
      this.overlay.add(group);
      p.guide = group;
      this.guides.set(p.id, group);
    }
  }

  clear() {
    for (const p of this.pieces) {
      if (p.ghost) {
        p.ghost.material?.dispose?.();
        p.ghost = null;
      }
      if (p.ghostEdge) {
        p.ghostEdge.geometry?.dispose?.();
        p.ghostEdge.material?.dispose?.();
        p.ghostEdge = null;
      }
      if (p.guide) {
        p.guide.traverse((o) => {
          if (o.geometry) o.geometry.dispose?.();
          if (o.material) o.material.dispose?.();
        });
        p.guide = null;
      }
      if (p.mesh) p.mesh.rotation.y = p.startYaw || 0;
    }
    this.overlay.clear();
    this.pieces = [];
    this.ghosts.clear();
    this.guides.clear();
    this.dragging = null;
    this.hovered = null;
    this.active = null;
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) {
      this.dragging = null;
      this.hovered = null;
      this.stage.controls.enabled = true;
    }
  }

  setGuideVisible(v) {
    this.guideVisible = v;
  }

  /* ------------------------------ 输入 ------------------------------ */
  _bind() {
    const el = this.stage.canvas;
    this._onDown = (e) => this._pointerDown(e);
    this._onMove = (e) => this._pointerMove(e);
    this._onUp = (e) => this._pointerUp(e);
    el.addEventListener('pointerdown', this._onDown, true);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _toNDC(e) {
    const rect = this.stage.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
  }

  _pick() {
    const roots = [];
    for (const p of this.pieces) {
      if (!p.draggable || p.assembled || p.hidden || p.locked) continue;
      if (p.mode === 'animating') continue;
      roots.push(p.mesh);
    }
    if (!roots.length) return null;
    const hits = this.raycaster.intersectObjects(roots, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && !o.userData.piece) o = o.parent;
      if (o?.userData.piece) return { piece: o.userData.piece, point: hit.point };
    }
    return null;
  }

  _axisOf(piece) {
    return piece.start.clone().sub(piece.target).normalize().negate();
  }

  _axisLength(piece) {
    return piece.start.distanceTo(piece.target);
  }

  _axisParam(e, piece) {
    this._toNDC(e);
    const dir = this._axisOf(piece);
    const camDir = this.stage.camera.getWorldDirection(new THREE.Vector3());
    // 平面包含拖拽轴、法线尽量朝向相机：n = camDir 在垂直于轴方向的分量
    const normal = camDir.clone().addScaledVector(dir, -camDir.dot(dir));
    const plane = new THREE.Plane();
    if (normal.lengthSq() > 0.04) {
      normal.normalize();
      plane.setFromNormalAndCoplanarPoint(normal, piece.start);
    } else {
      // 轴几乎与视线平行：退化为相机的正对平面
      plane.setFromNormalAndCoplanarPoint(camDir, piece.start);
    }
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return 0;
    return hit.sub(piece.start).dot(dir);
  }

  _pointerDown(e) {
    if (!this.enabled || this.dragging) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.audio.unlock();
    this._toNDC(e);
    const pick = this._pick();
    if (!pick) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    const p = pick.piece;
    this.dragging = p;
    this.active = p;
    this.hovered = p;
    this.stage.controls.enabled = false;
    try { this.stage.canvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
    this._grabT = this._axisParam(e, p);
    this._grabOffset = TMP_V1.copy(p.mesh.position).sub(p.start).dot(this._axisOf(p));
    this._lastSlide = 0;
    this._setHoverLook(p, true);
    this.cb.onDragStart?.(p);
  }

  _pointerMove(e) {
    if (!this.enabled) return;
    if (this.dragging) {
      const p = this.dragging;
      this._toNDC(e);
      const t = this._axisParam(e, p);
      const len = this._axisLength(p);
      let s = this._grabOffset + (t - this._grabT);
      s = clamp(s, 0, len);
      p.mesh.position.copy(p.start).addScaledVector(this._axisOf(p), s);
      const speed = Math.abs(t - (this._prevT ?? t));
      this._prevT = t;
      const now = performance.now();
      if (speed > 0.0015 && now - this._lastSlide > 90) {
        this.audio.slide(1);
        this._lastSlide = now;
      }
      this.cb.onDrag?.(p);
      return;
    }
    if (e.target !== this.stage.canvas) {
      if (this.hovered) this._setHoverLook(this.hovered, false);
      this.hovered = null;
      this.cb.onHover?.(null);
      return;
    }
    this._toNDC(e);
    const pick = this._pick();
    const p = pick?.piece || null;
    if (p !== this.hovered) {
      if (this.hovered) this._setHoverLook(this.hovered, false);
      this.hovered = p;
      if (p) this._setHoverLook(p, true);
      this.stage.canvas.style.cursor = p ? 'grab' : 'default';
      this.cb.onHover?.(p);
    }
  }

  _pointerUp(e) {
    if (this.dragging) {
      const p = this.dragging;
      this.dragging = null;
      this.stage.controls.enabled = true;
      try { this.stage.canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      this.stage.canvas.style.cursor = 'default';
      const err = this.positionError(p);
      const aerr = angleDelta(p.yaw, p.targetYaw);
      if (err < 0.4 && aerr < 0.17) {
        this._assemble(p);
      } else if (err < 0.9 && aerr >= 0.17) {
        this.cb.onTooRotated?.(p);
      } else {
        this.cb.onDrop?.(p);
      }
    }
  }

  _setHoverLook(p, on) {
    const e = p.mesh.userData.edges;
    if (!e) return;
    e.material.color.set(on ? 0xc79a55 : 0x2c2017);
    e.material.opacity = on ? 0.9 : 0.26;
  }

  _assemble(p) {
    p.mode = 'animating';
    if (p.ghost) p.ghost.visible = false;
    this.cb.onAssembleStart?.(p);
    const from = p.mesh.position.clone();
    const fromYaw = p.yaw;
    this.stage.animator.add({
      dur: 0.4,
      ease: Ease.outCubic,
      update: (e) => {
        p.mesh.position.lerpVectors(from, p.target, e);
        p.yaw = lerp(fromYaw, p.targetYaw, e);
        p.mesh.rotation.y = p.yaw;
      },
      done: () => {
        p.mesh.position.copy(p.target);
        p.yaw = p.targetYaw;
        p.mesh.rotation.y = p.targetYaw;
        p.assembled = true;
        p.mode = 'drag';
        if (p.guide) p.guide.visible = false;
        this.active = null;
        this.audio.snap();
        this.setHoverLookOff(p);
        this.cb.onAssembled?.(p);
      },
    });
  }

  setHoverLookOff(p) {
    const e = p.mesh.userData.edges;
    if (!e) return;
    e.material.color.set(0x2c2017);
    e.material.opacity = 0.26;
  }

  rotate(dir) {
    let p = this.dragging || this.hovered;
    if (!p || !p.rotatable || p.assembled || p.locked) {
      p = this.pieces.find((q) => q.rotatable && !q.assembled && !q.locked && !q.hidden);
    }
    if (!p) return false;
    p.yaw = wrapAngle(p.yaw + dir * ROT_STEP);
    this.audio.tick();
    this.cb.onRotate?.(p);
    return true;
  }

  /** 一键把可旋转构件摆正（用于提示） */
  alignRotation() {
    const p = this.pieces.find((q) => q.rotatable && !q.assembled && !q.locked);
    if (!p) return;
    p.yaw = 0;
    this.audio.snap();
    this.cb.onRotate?.(p);
  }

  positionError(p) {
    return p.mesh.position.distanceTo(p.target);
  }

  angleError(p) {
    return angleDelta(p.yaw, p.targetYaw);
  }

  ready(p) {
    return this.positionError(p) < 0.4 && this.angleError(p) < 0.17;
  }

  unlock(id, { reveal = true } = {}) {
    const p = this.pieces.find((q) => q.id === id);
    if (!p) return;
    p.locked = false;
    p.hidden = false;
    if (reveal) {
      p.mesh.visible = true;
      if (p.ghost) p.ghost.visible = true;
      const s = p.mesh.scale.clone();
      p.mesh.scale.setScalar(0.6);
      this.stage.animator.add({
        dur: 0.5,
        ease: Ease.outBack,
        update: (e) => p.mesh.scale.setScalar(lerp(0.6, 1, e)),
        done: () => p.mesh.scale.copy(s),
      });
      this.cb.onUnlock?.(p);
    }
  }

  /* ------------------------------ 帧更新 ------------------------------ */
  update(dt) {
    for (const p of this.pieces) {
      // 旋转缓动
      if (p.rotatable && !p.assembled) {
        const diff = wrapAngle(p.yaw - p.mesh.rotation.y);
        if (Math.abs(diff) > 0.0005) {
          p.mesh.rotation.y = wrapAngle(p.mesh.rotation.y + diff * Math.min(1, dt * 16));
        }
      }
      if (!p.draggable) continue;
      const active = p === this.dragging;
      const err = this.positionError(p);
      const aerr = this.angleError(p);
      const near = err < 2.2;
      const aligned = aerr < 0.17;
      const ready = err < 0.4 && aligned;

      if (p.ghost) {
        const show = this.enabled && !p.assembled && p.mode !== 'animating' && !p.locked && !p.hidden;
        p.ghost.visible = show;
        if (show) {
          const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
          let op = 0.05 + (near ? 0.04 : 0) + (aligned && near ? 0.06 : 0);
          if (ready || active) op = 0.14 + pulse * 0.12;
          p.ghost.material.opacity = op;
          if (p.ghostEdge) p.ghostEdge.material.opacity = 0.18 + (ready ? 0.4 : 0) + (active ? 0.12 : 0);
        }
      }
      if (p.guide) {
        p.guide.visible = this.guideVisible && this.enabled && !p.assembled && !p.locked && !p.hidden;
      }
    }
  }

  dispose() {
    const el = this.stage.canvas;
    el.removeEventListener('pointerdown', this._onDown, true);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    this.overlay.traverse((o) => {
      if (o.isLineSegments || o.isLine) o.geometry?.dispose?.();
      if (o.isMesh) o.geometry?.dispose?.();
      if (o.material?.dispose) o.material.dispose?.();
    });
    this.overlay.clear();
    this.stage.scene.remove(this.overlay);
  }
}
