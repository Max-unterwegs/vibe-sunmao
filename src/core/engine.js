/**
 * 展厅舞台：渲染器 / 相机 / 灯光 / 展台 / 尘埃 / 轨道控制 / 相机运镜
 */
import * as THREE from '../three.js';
import { OrbitControls } from '../../vendor/addons/OrbitControls.js';
import { RoomEnvironment } from '../../vendor/addons/RoomEnvironment.js';
import { Animator, Ease, clamp } from './anim.js';
import { makeDustTexture } from './wood.js';

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xece4d6, 18, 42);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    this.camera.position.set(7, 5, 9);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.rotateSpeed = 0.75;
    this.controls.zoomSpeed = 0.7;
    this.controls.panSpeed = 0.6;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 20;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = 1.46;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.target.set(0, 0, 0);

    this.animator = new Animator();
    this.clock = new THREE.Clock();
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.ticker = [];
    this.dust = null;

    this._buildEnvironment();
    this._buildLights();
    this._buildPlatform();
    this._buildDust();
    this._bindResize();
    this._loop();
  }

  _buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const room = new RoomEnvironment();
    this.envMap = pmrem.fromScene(room, 0.045).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.5;
    room.dispose?.();
    pmrem.dispose();
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0xfff8ec, 0x6f5a44, 0.42);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff1dc, 2.85);
    key.position.set(6, 9.5, 5.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -5;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.022;
    key.shadow.radius = 4;
    this.scene.add(key);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0xd9e6ff, 0.5);
    fill.position.set(-7, 4.5, -4);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd7a3, 1.5);
    rim.position.set(-3, 3.2, -8);
    this.scene.add(rim);

    const top = new THREE.SpotLight(0xfff0d6, 28, 16, 0.55, 0.65, 1.4);
    top.position.set(0, 8, 1.5);
    top.target.position.set(0, 0, 0);
    this.scene.add(top, top.target);
  }

  _buildPlatform() {
    const g = new THREE.Group();

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(6.3, 6.55, 0.36, 72),
      new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.7, metalness: 0.08 }),
    );
    base.position.y = -1.94;
    base.receiveShadow = true;
    base.castShadow = true;
    g.add(base);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(6.16, 6.16, 0.04, 72),
      new THREE.MeshStandardMaterial({ color: 0x8a8175, roughness: 0.9, metalness: 0.05 }),
    );
    top.position.y = -1.75;
    top.receiveShadow = true;
    g.add(top);

    const brass = new THREE.MeshStandardMaterial({ color: 0xb98d4e, metalness: 0.95, roughness: 0.32 });
    const inner = new THREE.Mesh(new THREE.RingGeometry(3.35, 3.39, 96), brass);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = -1.728;
    g.add(inner);

    const outer = new THREE.Mesh(new THREE.RingGeometry(5.72, 5.75, 96), brass);
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -1.728;
    g.add(outer);

    // 展台边缘的一圈微光
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(6.2, 6.9, 96),
      new THREE.MeshBasicMaterial({ color: 0xffe9c7, transparent: true, opacity: 0.06, side: 2, depthWrite: false }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -1.752;
    g.add(glow);

    this.platform = g;
    this.scene.add(g);
  }

  _buildDust() {
    const count = 130;
    const pos = new Float32Array(count * 3);
    this.dustSeed = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = -1.2 + Math.random() * 4.6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
      this.dustSeed[i * 3] = Math.random() * 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.055,
      map: makeDustTexture(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xffe9c4,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    this.dust = points;
    this.scene.add(points);
  }

  _bindResize() {
    this._onResize = () => {
      const w = this.canvas.clientWidth || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.aspect = w / h;
      this.width = w;
      this.height = h;
    };
    window.addEventListener('resize', this._onResize);
    this._onResize();
  }

  _loop() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, this.clock.getDelta());
      this.animator.update(dt);
      this.controls.update();
      if (this.dust) {
        const t = this.clock.elapsedTime;
        const pos = this.dust.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const s = this.dustSeed[i * 3];
          pos.array[i * 3] += Math.sin(t * 0.22 + s) * 0.0016;
          pos.array[i * 3 + 1] += 0.0016 + Math.sin(t * 0.3 + s) * 0.0008;
          pos.array[i * 3 + 2] += Math.cos(t * 0.18 + s * 1.3) * 0.0014;
          if (pos.array[i * 3 + 1] > 3.6) pos.array[i * 3 + 1] = -1.4;
        }
        pos.needsUpdate = true;
      }
      for (const fn of this.ticker) fn(dt);
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  onTick(fn) {
    this.ticker.push(fn);
    return () => {
      const i = this.ticker.indexOf(fn);
      if (i >= 0) this.ticker.splice(i, 1);
    };
  }

  /** 相机的右向量（世界坐标） */
  rightVector() {
    const f = new THREE.Vector3();
    this.camera.getWorldDirection(f);
    return new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  }

  /** 计算某个包围盒的理想机位 */
  composition(box, dir, bias = 0) {
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const d = new THREE.Vector3(...dir).normalize();
    const fov = (this.camera.fov * Math.PI) / 180;
    const aspect = this.camera.aspect || 1.6;
    const distV = sphere.radius / Math.tan(fov / 2);
    const distH = sphere.radius / (Math.tan(fov / 2) * aspect);
    const dist = Math.max(distV, distH) * 1.02 + 1.1;
    // 让展品在画面中偏右，给左侧知识面板留出呼吸
    const right = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize().negate();
    const b = (this.width || window.innerWidth) < 900 ? bias * 0.12 : bias;
    const target = center.clone().addScaledVector(right, -b);
    const position = target.clone().addScaledVector(d, dist);
    position.y = Math.max(position.y, -1.2);
    return { position, target, distance: dist };
  }

  flyTo(box, dir, bias = 0, duration = 1.1, instant = false) {
    const { position, target } = this.composition(box, dir, bias);
    this.controls.maxDistance = Math.max(22, position.distanceTo(target) * 2.2);
    if (instant) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      return;
    }
    const p0 = this.camera.position.clone();
    const t0 = this.controls.target.clone();
    this.animator.add({
      dur: duration,
      ease: Ease.inOutCubic,
      update: (e) => {
        this.camera.position.lerpVectors(p0, position, e);
        this.controls.target.lerpVectors(t0, target, e);
      },
    });
  }

  setDustVisible(v) {
    if (this.dust) this.dust.visible = v;
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    this.controls.dispose();
  }
}

/** 释放一个组内所有几何体（材质由共享库持有，不在此释放） */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.isMesh || o.isLineSegments || o.isLine) {
      o.geometry?.dispose?.();
      if (o.material && o.material.userData?.disposable) o.material.dispose();
    }
  });
}

export function screenPosition(vector, camera, width, height) {
  const v = vector.clone().project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * width,
    y: (-v.y * 0.5 + 0.5) * height,
    z: v.z,
    visible: v.z < 1,
  };
}
