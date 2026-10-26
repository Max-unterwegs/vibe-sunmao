/**
 * 博物馆总控：模式切换、关卡装配、进度、爆炸视图、图谱、相机与音效
 */
import * as THREE from '../three.js';
import { Stage, disposeTree, screenPosition } from '../core/engine.js';
import { AudioEngine } from '../core/audio.js';
import { createWoodLibrary, makeShadowTexture } from '../core/wood.js';
import { Ease, clamp } from '../core/anim.js';
import { Interaction } from './interaction.js';
import { UI } from '../ui/ui.js';
import { LEVEL_DEFS } from '../levels/index.js';

const STORE_KEY = 'sunmao.progress.v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const LEVEL_HINTS = [
  '拖住横枨向右推，让榫头穿入卯眼',
  '按 Q / E 把木料转正，再沿燕尾槽推入',
  '对准 45° 卯口，将横枨垂直推入',
  '先搭接右段扶手，再插入楔钉锁死',
];

export class Museum {
  constructor(canvas) {
    this.canvas = canvas;
    this.stage = null;
    this.audio = null;
    this.interaction = null;
    this.materials = null;
    this.ui = new UI({
      onStart: () => this.startFirstLevel(),
      onLevel: (i) => this.startLevel(i),
      onGallery: () => this.openGallery(),
      onTool: (id) => this.runTool(id),
      onRotate: (dir) => this.rotatePiece(dir),
      onCam: (key) => this.cameraPreset(key),
      onQuiz: (ok) => this.recordQuiz(ok),
      onModalClose: () => {},
    });
    this.mode = 'landing';
    this.current = -1;
    this.pieces = [];
    this.steps = [];
    this.levelRoot = null;
    this.galleryRoot = null;
    this.galleryBox = null;
    this.homeBox = null;
    this.exploded = false;
    this.guides = false;
    this.soundOn = true;
    this.completed = false;
    this._completeTimer = 0;
    this._lastDeg = null;
    this.progress = this.loadProgress();
    this._bindKeys();
  }

  /* --------------------------------- 启动 --------------------------------- */
  async boot() {
    const gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
    if (!gl) {
      this.ui.showFallback();
      return;
    }
    this.ui.setLoader(0.12, '正在辨认木纹…');
    await nextFrame();
    this.stage = new Stage(this.canvas);
    this.audio = new AudioEngine();
    this.ui.setLoader(0.35, '正在刨光榫头…');
    await nextFrame();
    await sleep(60);
    this.materials = createWoodLibrary(this.stage.renderer);
    this.shadowTex = makeShadowTexture();
    this.ui.setLoader(0.7, '正在布置展厅…');
    await nextFrame();
    this.interaction = new Interaction(this.stage, this.audio, {
      onHover: (p) => this.onHover(p),
      onDragStart: () => this.ui.setHint('推入到位后会吸附，并发出木头的响声'),
      onTooRotated: () => {
        this.ui.toast('角度未对齐 · 按 Q / E 旋转木料');
        this.audio.error();
      },
      onUnlock: () => {
        this.ui.toast('楔钉已就位，插入孔洞完成锁死');
        this.audio.tick();
      },
      onAssembled: (p) => this.onAssembled(p),
    });
    this.buildGallery();
    this.ui.setLoader(0.95, '正在点灯…');
    await nextFrame();
    await sleep(120);
    this.ui.setLoader(1, '布展完成');
    await sleep(280);
    this.ui.hideLoader();
    this.ui.setAppMode('landing');
    this.ui.showLanding(this.view());
    this.mode = 'landing';
    this.galleryRoot.visible = true;
    this.setGalleryLabels(false);
    this.stage.controls.autoRotate = true;
    this.stage.flyTo(this.galleryBox, [0.55, 0.42, 1], 2.4, 1.4, true);
    this.stage.onTick(() => this.update());
  }

  view() {
    return {
      unlocked: this.progress.unlocked,
      levels: this.progress.levels,
      list: LEVEL_DEFS.map((d) => d.info),
    };
  }

  loadProgress() {
    const base = { unlocked: 0, levels: {} };
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      const data = JSON.parse(raw);
      return {
        unlocked: clamp(Number(data.unlocked) || 0, 0, LEVEL_DEFS.length - 1),
        levels: data.levels || {},
      };
    } catch {
      return base;
    }
  }

  saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.progress)); } catch { /* 无痕模式 */ }
  }

  /* -------------------------------- 展厅图谱 ------------------------------- */
  buildGallery() {
    if (this.galleryRoot) return;
    const group = new THREE.Group();
    const layout = [
      [0.95, 0, 0.95],
      [3.25, 0, 0.95],
      [0.95, 0, -1.75],
      [3.25, 0, -1.75],
    ];
    LEVEL_DEFS.forEach((def, i) => {
      const holder = new THREE.Group();
      const { pieces } = def.create(this.materials);
      for (const p of pieces) {
        p.mesh.position.copy(p.target);
        p.mesh.rotation.y = 0;
        p.mesh.visible = true;
        p.mesh.castShadow = true;
        holder.add(p.mesh);
      }
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(holder);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = 2.05 / Math.max(size.x, size.y, size.z, 0.001);
      holder.scale.setScalar(s);
      holder.position.set(
        layout[i][0] - center.x * s,
        layout[i][1] - center.y * s + 0.28,
        layout[i][2] - center.z * s,
      );
      group.add(holder);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.12, 0.011, 8, 64),
        new THREE.MeshStandardMaterial({ color: 0xb98d4e, metalness: 0.9, roughness: 0.35 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(layout[i][0], -1.722, layout[i][2]);
      group.add(ring);

      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.05, 40),
        new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, opacity: 0.45, depthWrite: false }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(layout[i][0], -1.727, layout[i][2]);
      group.add(disc);

      const label = this.makeLabel(def.info.numeral, def.info.name, def.info.joint);
      label.userData.galleryLabel = true;
      label.position.set(layout[i][0], -1.2, layout[i][2] + 0.5);
      group.add(label);
    });
    this.galleryRoot = group;
    this.stage.world.add(group);
    this.galleryBox = new THREE.Box3().setFromObject(group);
  }

  setGalleryLabels(v) {
    if (!this.galleryRoot) return;
    this.galleryRoot.traverse((o) => {
      if (o.isSprite && o.userData.galleryLabel) o.visible = v;
    });
  }

  makeLabel(numeral, name, joint) {
    const W = 560;
    const H = 172;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const r = 26;
    ctx.beginPath();
    ctx.moveTo(r, 6);
    ctx.arcTo(W - 6, 6, W - 6, H - 6, r);
    ctx.arcTo(W - 6, H - 6, 6, H - 6, r);
    ctx.arcTo(6, H - 6, 6, 6, r);
    ctx.arcTo(6, 6, W - 6, 6, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(251,247,239,0.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,54,36,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#a8402f';
    ctx.font = '600 82px "Songti SC","SimSun",serif';
    ctx.fillText(numeral, 34, 92);
    ctx.fillStyle = '#241f19';
    ctx.font = '600 46px "Songti SC","SimSun",serif';
    ctx.fillText(name, 152, 68);
    ctx.fillStyle = '#7d7263';
    ctx.font = '28px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(joint, 154, 122);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.2, 0.37, 1);
    return sprite;
  }

  openGallery() {
    if (!this.stage) return;
    clearTimeout(this._completeTimer);
    this.destroyLevel();
    this.mode = 'gallery';
    this.current = -1;
    this.completed = false;
    this.galleryRoot.visible = true;
    this.setGalleryLabels(true);
    this.stage.controls.autoRotate = true;
    this.stage.controls.autoRotateSpeed = 0.42;
    this.stage.flyTo(this.galleryBox, [0.55, 0.42, 1], 1.1, 1.25);
    this.interaction.setEnabled(false);
    this.ui.showGallery(this.view());
    this.ui.setRotation({ visible: false });
    this.audio.whoosh(0.8);
  }

  /* --------------------------------- 关卡 --------------------------------- */
  startFirstLevel() {
    const idx = LEVEL_DEFS.findIndex((d) => !this.progress.levels[d.meta.id]?.done);
    this.startLevel(idx >= 0 ? idx : 0);
  }

  startLevel(index, { keepCamera = false } = {}) {
    if (!this.stage) return;
    if (index > this.progress.unlocked) {
      this.ui.toast('先完成前一关，再来这里');
      this.audio.unlock();
      this.audio.error();
      return;
    }
    clearTimeout(this._completeTimer);
    this.audio.unlock();
    this.mode = 'level';
    this.current = index;
    this.completed = false;
    this.exploded = false;
    this.guides = this.ui.el.toolbar.querySelector('[data-tool="guides"]')?.classList.contains('active') || false;
    const def = LEVEL_DEFS[index];
    this.def = def;
    this.galleryRoot.visible = false;
    this.stage.controls.autoRotate = false;
    this.stage.animator.clear();
    this.buildLevel(def, keepCamera);
    this.interaction.setGuideVisible(this.guides);
    this.ui.showLevel(def, this.view());
    this.ui.setSteps(this.steps);
    this.ui.setToolActive('explode', false);
    this.ui.setToolActive('guides', this.guides);
    this.ui.setToolActive('sound', this.soundOn);
    this.ui.setRotation({ visible: false });
    this.ui.setHint(LEVEL_HINTS[index] || '拖拽木料，推入装配');
    this.ui.setNavProgress(this.view(), index);
    this.audio.whoosh(0.65);
    this.baseHint = LEVEL_HINTS[index];
  }

  buildLevel(def, keepCamera) {
    this.destroyLevel();
    this.levelRoot = new THREE.Group();
    const { pieces } = def.create(this.materials);
    for (const p of pieces) this.levelRoot.add(p.mesh);
    this.stage.world.add(this.levelRoot);
    this.levelRoot.updateMatrixWorld(true);
    this.pieces = pieces;
    this.steps = def.meta.steps.map((s) => ({ ...s, done: false }));
    this.completed = false;
    this.exploded = false;
    this.homeBox = new THREE.Box3().setFromObject(this.levelRoot);
    this.addContactShadow(this.homeBox);
    this.interaction.setLevel(pieces);
    if (!keepCamera) {
      this.stage.flyTo(this.homeBox, def.meta.cameraDir, def.meta.bias ?? 0.35, 1.15);
    }
  }

  destroyLevel() {
    if (this.interaction) {
      this.interaction.clear();
      this.interaction.setEnabled(false);
    }
    this.removeContactShadow();
    if (this.levelRoot) {
      this.stage.world.remove(this.levelRoot);
      disposeTree(this.levelRoot);
      this.levelRoot = null;
    }
    this.pieces = [];
    this.steps = [];
  }

  addContactShadow(box) {
    this.removeContactShadow();
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(1.5, Math.max(size.x, size.z) * 0.5);
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 48),
      new THREE.MeshBasicMaterial({
        map: this.shadowTex,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, -1.727, center.z);
    mesh.renderOrder = 1;
    this.contactShadow = mesh;
    this.stage.scene.add(mesh);
  }

  removeContactShadow() {
    if (!this.contactShadow) return;
    this.stage.scene.remove(this.contactShadow);
    this.contactShadow.geometry.dispose();
    this.contactShadow.material.dispose();
    this.contactShadow = null;
  }

  /* --------------------------------- 帧更新 -------------------------------- */
  update() {
    if (this.mode !== 'level' || !this.interaction) return;
    const now = performance.now();

    // 步骤判定
    let changed = false;
    for (const s of this.steps) {
      if (s.done) continue;
      const p = this.pieces.find((x) => x.id === s.piece);
      if (!p) continue;
      let ok = false;
      if (s.type === 'insert') ok = p.assembled;
      else if (s.type === 'near') ok = this.interaction.positionError(p) < (s.dist || 1.2);
      else if (s.type === 'rotate') ok = this.interaction.angleError(p) < ((s.tol || 8) * Math.PI) / 180;
      if (ok) {
        s.done = true;
        changed = true;
        this.audio.tick();
      }
    }
    if (changed) {
      this.ui.setSteps(this.steps);
      const next = this.steps.find((s) => !s.done);
      if (next) this.ui.toast(`下一序 · ${next.label}`, 1800);
    }

    // 楔钉解锁
    const lap = this.steps.find((s) => s.id === 'lap');
    const pin = this.pieces.find((x) => x.id === 'pin');
    if (lap?.done && pin?.locked) this.interaction.unlock('pin');

    if (!this.completed && this.steps.length && this.steps.every((s) => s.done)) this.complete();

    // 旋转控件
    const rot = this.pieces.find((p) => p.rotatable && !p.assembled);
    if (rot) {
      const aerr = this.interaction.angleError(rot);
      const deg = Math.round((aerr * 180) / Math.PI);
      const aligned = aerr < (8 * Math.PI) / 180;
      if (deg !== this._lastDeg) {
        this._lastDeg = deg;
        this.ui.setRotation({ visible: true, angle: aerr, aligned });
      }
    } else if (this._lastDeg !== null) {
      this._lastDeg = null;
      this.ui.setRotation({ visible: false });
    }

    // 悬停木牌
    const hover = this.interaction.dragging || this.interaction.hovered;
    if (hover && !hover.assembled) {
      const v = hover.mesh.position.clone();
      v.y += 0.55;
      const s = screenPosition(v, this.stage.camera, this.stage.width, this.stage.height);
      this.ui.setHoverLabel(hover.label || hover.id, s.x, s.y, s.visible);
      if (this.interaction.hovered && !this.interaction.dragging) {
        this.ui.setHint(`${hover.label} · 按住拖拽以装配`);
      }
    } else {
      this.ui.setHoverLabel('', 0, 0, false);
      if (this.baseHint) this.ui.setHint(this.baseHint);
    }
  }

  onHover(p) {
    if (!p) {
      this.ui.setHoverLabel('', 0, 0, false);
      if (this.baseHint) this.ui.setHint(this.baseHint);
    }
  }

  onAssembled(p) {
    this.ui.setHint(this.baseHint || '');
    if (this.mode !== 'level') return;
    // 每完成一个构件，镜头轻轻推近一点
    const box = new THREE.Box3().setFromObject(this.levelRoot);
    if (box.getSize(new THREE.Vector3()).length() > 0.1) {
      const dir = this.def.meta.cameraDir;
      this.stage.flyTo(box, dir, this.def.meta.bias ?? 0.3, 1.0);
    }
    this.stage.controls.autoRotate = false;
  }

  complete() {
    this.completed = true;
    this.interaction.setEnabled(false);
    this.audio.chime();
    this.ui.setRotation({ visible: false });
    this.ui.setSteps(this.steps);
    const def = this.def;
    const id = def.meta.id;
    this.progress.levels[id] = {
      ...(this.progress.levels[id] || {}),
      done: true,
      at: Date.now(),
    };
    this.progress.unlocked = Math.max(this.progress.unlocked, Math.min(this.current + 1, LEVEL_DEFS.length - 1));
    this.saveProgress();
    this.ui.setNavProgress(this.view(), this.current);
    this.baseHint = '合榫完成 · 一件木器就此成立';
    this.ui.setHint(this.baseHint);
    const box = new THREE.Box3().setFromObject(this.levelRoot);
    const dir = def.meta.cameraDir;
    this.stage.flyTo(box, [dir[0] * 0.9 + 0.1, dir[1] + 0.2, dir[2] * 0.95], 0.05, 1.6);
    this._completeTimer = setTimeout(() => {
      if (this.mode !== 'level' || this.current !== def.index) return;
      this.ui.showComplete({
        def,
        isLast: def.index === LEVEL_DEFS.length - 1,
        hasNext: def.index < LEVEL_DEFS.length - 1,
        quiz: def.info.quiz,
        onAnswer: (ok) => this.recordQuiz(ok),
        onNext: () => {
          if (def.index < LEVEL_DEFS.length - 1) this.startLevel(def.index + 1);
          else this.openGallery();
        },
        onReplay: () => { /* 保留完成的模型，仅关闭弹层 */ },
        onGallery: () => this.openGallery(),
      });
      this.audio.ui();
    }, 1500);
  }

  recordQuiz(ok) {
    const id = this.def?.meta.id;
    if (!id) return;
    this.progress.levels[id] = { ...(this.progress.levels[id] || {}), done: true, quiz: ok ? 'right' : 'try' };
    if (ok) this.progress.levels[id].quiz = 'right';
    this.saveProgress();
  }

  /* --------------------------------- 工具 ---------------------------------- */
  runTool(id) {
    this.audio.unlock();
    if (this.mode === 'landing') return;
    switch (id) {
      case 'reset':
        if (this.mode !== 'level') return;
        this.startLevel(this.current, { keepCamera: true });
        this.ui.toast('木料已复位');
        this.audio.whoosh(0.4);
        break;
      case 'explode':
        this.toggleExplode();
        break;
      case 'guides':
        this.guides = !this.guides;
        this.ui.setToolActive('guides', this.guides);
        this.interaction.setGuideVisible(this.guides);
        this.ui.toast(this.guides ? '辅助线已开启 · 观察装配轴线' : '辅助线已关闭');
        this.audio.ui();
        break;
      case 'sound':
        this.soundOn = !this.soundOn;
        this.audio.setMuted(!this.soundOn);
        this.ui.setToolActive('sound', this.soundOn);
        this.audio.ui();
        break;
      case 'help':
        this.ui.showHelp();
        break;
      case 'info':
        this.ui.togglePanel();
        break;
      case 'atlas':
        this.openGallery();
        break;
      default:
        break;
    }
  }

  toggleExplode() {
    if (this.mode !== 'level' || this.completed) {
      if (this.completed) this.ui.toast('本关已完成，可重玩后再看爆炸视图');
      return;
    }
    this.exploded = !this.exploded;
    this.ui.setToolActive('explode', this.exploded);
    this.interaction.setEnabled(!this.exploded);
    if (this.exploded) {
      for (const p of this.pieces) {
        p._base = p.mesh.position.clone();
        const to = p._base.clone().add(p.explode);
        this.tweenPiece(p, to, 0.8);
      }
      this.ui.setHint('爆炸视图 · 观察榫头与卯眼的咬合关系');
      this.ui.toast('爆炸视图：榫卯内部结构一目了然');
    } else {
      for (const p of this.pieces) {
        this.tweenPiece(p, p._base || p.target, 0.7);
        p._base = null;
      }
      this.ui.setHint(this.baseHint || '');
      this.interaction.setEnabled(true);
    }
    this.audio.whoosh(0.5);
  }

  tweenPiece(p, to, dur) {
    const from = p.mesh.position.clone();
    this.stage.animator.add({
      dur,
      ease: Ease.inOutCubic,
      update: (e) => p.mesh.position.lerpVectors(from, to, e),
      done: () => p.mesh.position.copy(to),
    });
  }

  rotatePiece(dir) {
    if (!this.interaction) return;
    this.audio.unlock();
    const ok = this.interaction.rotate(dir);
    if (!ok) this.ui.toast('此构件无需旋转');
  }

  cameraPreset(key) {
    if (!this.stage) return;
    const box = this.mode === 'gallery' ? this.galleryBox : this.homeBox;
    if (!box) return;
    const dirs = {
      home: this.mode === 'gallery' ? [0.55, 0.42, 1] : (this.def?.meta.cameraDir || [0.6, 0.4, 1]),
      front: [0.04, 0.16, 1],
      side: [1, 0.16, 0.08],
      top: [0.08, 1, 0.22],
    };
    this.stage.controls.autoRotate = false;
    this.stage.flyTo(box, dirs[key] || dirs.home, 0.15, 1.0);
    this.audio.ui();
  }

  /* --------------------------------- 键盘 ---------------------------------- */
  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('#modal.open')) return;
      const k = e.key.toLowerCase();
      if (k === 'q') { this.rotatePiece(-1); return; }
      if (k === 'e') { this.rotatePiece(1); return; }
      if (k === 'r') { this.runTool('reset'); return; }
      if (k === 'x') { this.runTool('explode'); return; }
      if (k === 'g') { this.runTool('guides'); return; }
      if (k === 'm') { this.runTool('sound'); return; }
      if (k === 'h') { if (this.mode !== 'landing') this.runTool('help'); return; }
      if (k === 'escape') { this.ui.closeModal(); return; }
      if (k === '1' || k === '2' || k === '3' || k === '4') {
        const idx = Number(k) - 1;
        if (idx <= this.progress.unlocked) this.startLevel(idx);
      }
    });
    // 首次手势解锁音频
    const unlock = () => this.audio?.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }
}
