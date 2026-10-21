// 戰場特效：陣亡士兵（倒下後留在地上）、箭矢拋射、衝鋒揚塵
import * as THREE from 'three';
import { height } from '../sim/sim.ts';
import { toWorld, yawOf } from './coords.ts';

const VISUAL_SCALE = 1.4;

// ---------------- 陣亡 ----------------
type Fall = { slot: number; x: number; y: number; hd: number; dir: number; roll: boolean; t: number };
class CorpseSet {
  mesh: THREE.InstancedMesh;
  next = 0; used = 0;
  falling: Fall[] = [];
  constructor(scene: THREE.Scene, geo: THREE.BufferGeometry, readonly cap: number, readonly roll: boolean) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: '#8a8278' });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
}

export class Corpses {
  private sets = new Map<string, CorpseSet>();
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private q2 = new THREE.Quaternion();
  private sc = new THREE.Vector3(VISUAL_SCALE, VISUAL_SCALE, VISUAL_SCALE);
  private up = new THREE.Vector3(0, 1, 0); private ax = new THREE.Vector3(1, 0, 0); private az = new THREE.Vector3(0, 0, 1);
  constructor(private scene: THREE.Scene) {}
  // dir：倒下方向相對面向（+1 向後倒、−1 向前倒）；騎兵改為側倒
  add(key: string, geo: THREE.BufferGeometry, cav: boolean, x: number, y: number, hd: number, dir: number) {
    let s = this.sets.get(key);
    if (!s) { s = new CorpseSet(this.scene, geo, 700, cav); this.sets.set(key, s); }
    const slot = s.next; s.next = (s.next + 1) % s.cap; s.used = Math.min(s.cap, s.used + 1);
    s.mesh.count = s.used;
    s.falling = s.falling.filter(f => f.slot !== slot);
    s.falling.push({ slot, x, y, hd, dir, roll: cav, t: 0 });
    this.place(s, s.falling[s.falling.length - 1], 0);
  }
  private place(s: CorpseSet, f: Fall, k: number) {
    const e = k * k; // 加速倒下
    const p = toWorld(f.x, f.y, height(f.x, f.y) + 0.12 * e);
    this.q.setFromAxisAngle(this.up, yawOf(f.hd));
    if (f.roll) this.q2.setFromAxisAngle(this.az, f.dir * e * Math.PI / 2 * 0.95);
    else this.q2.setFromAxisAngle(this.ax, -f.dir * e * Math.PI / 2 * 0.96);
    this.q.multiply(this.q2);
    this.m.compose(p, this.q, this.sc);
    s.mesh.setMatrixAt(f.slot, this.m);
    s.mesh.instanceMatrix.needsUpdate = true;
  }
  update(dt: number) {
    for (const s of this.sets.values()) {
      if (!s.falling.length) continue;
      for (const f of s.falling) { f.t = Math.min(1, f.t + dt / 0.55); this.place(s, f, f.t); }
      s.falling = s.falling.filter(f => f.t < 1);
    }
  }
}

// ---------------- 箭矢 ----------------
type Arrow = { x0: number; y0: number; h0: number; x1: number; y1: number; h1: number; arc: number; t0: number; T: number; stuck: number };
export class Arrows {
  private mesh: THREE.InstancedMesh;
  private list: Arrow[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private one = new THREE.Vector3(1, 1, 1);
  private fwd = new THREE.Vector3(0, 0, 1); private v = new THREE.Vector3(); private p = new THREE.Vector3();
  private clock = 0;
  constructor(scene: THREE.Scene, private cap = 1600) {
    const g = new THREE.BoxGeometry(0.06, 0.06, 1.6).translate(0, 0, -0.5); // 箭頭在原點，插地時露出箭桿
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#2a2219' }), cap);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }
  // 從 (x0,y0) 射向 (x1,y1)，delay 秒後發射
  fire(x0: number, y0: number, x1: number, y1: number, delay: number) {
    if (this.list.length >= this.cap) return 0;
    const d = Math.hypot(x1 - x0, y1 - y0);
    const T = 0.7 + d / 75;
    this.list.push({ x0, y0, h0: height(x0, y0) + 2.2, x1, y1, h1: height(x1, y1) + 0.25, arc: 6 + d * 0.28, t0: this.clock + delay, T, stuck: 0 });
    return delay + T;
  }
  update(dt: number) {
    this.clock += dt;
    let n = 0;
    const keep: Arrow[] = [];
    for (const a of this.list) {
      let s = (this.clock - a.t0) / a.T;
      if (s < 0) { keep.push(a); continue; }
      if (s >= 1) { a.stuck += dt; if (a.stuck > 2.5) continue; s = 1; }
      keep.push(a);
      const x = a.x0 + (a.x1 - a.x0) * s, y = a.y0 + (a.y1 - a.y0) * s;
      const h = a.h0 + (a.h1 - a.h0) * s + 4 * a.arc * s * (1 - s);
      this.p.copy(toWorld(x, y, h));
      // 速度方向（對 s 微分）；世界座標 z = −模擬 y
      const dh = (a.h1 - a.h0) + 4 * a.arc * (1 - 2 * s);
      this.v.set(a.x1 - a.x0, dh, -(a.y1 - a.y0)).normalize();
      this.q.setFromUnitVectors(this.fwd, this.v);
      this.m.compose(this.p, this.q, this.one);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.list = keep;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- 揚塵 ----------------
const DUST_VS = `
attribute float alpha; attribute float size;
varying float vA;
void main() {
  vA = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (420.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FS = `
uniform vec3 color; varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0;
  if (r > 1.0) discard;
  gl_FragColor = vec4(color, vA * (1.0 - r));
}`;
type Puff = { x: number; y: number; h: number; vx: number; vy: number; vh: number; life: number; age: number; s: number };
export class Dust {
  private pts: THREE.Points;
  private pos: Float32Array; private al: Float32Array; private sz: Float32Array;
  private list: Puff[] = [];
  constructor(scene: THREE.Scene, private cap = 400, color = '#b9a888', private scale = 1, private alphaMax = 0.7) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3); this.al = new Float32Array(cap); this.sz = new Float32Array(cap);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.al, 1));
    g.setAttribute('size', new THREE.BufferAttribute(this.sz, 1));
    const mat = new THREE.ShaderMaterial({ vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false,
      uniforms: { color: { value: new THREE.Color(color) } } });
    this.pts = new THREE.Points(g, mat); this.pts.frustumCulled = false; this.pts.renderOrder = 6;
    scene.add(this.pts);
  }
  burst(x: number, y: number, n: number, spread: number, dirX = 0, dirY = 0) {
    for (let i = 0; i < n && this.list.length < this.cap; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      const sp = 1 + Math.random() * 3;
      this.list.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, h: height(x, y) + 1.2 + Math.random(),
        vx: Math.cos(a) * sp + dirX * 3, vy: Math.sin(a) * sp + dirY * 3, vh: 0.6 + Math.random() * 1.2,
        life: (1.8 + Math.random() * 1.4) * this.scale, age: 0, s: (4 + Math.random() * 4) * this.scale });
    }
  }
  update(dt: number) {
    let n = 0;
    this.list = this.list.filter(p => (p.age += dt) < p.life);
    for (const p of this.list) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.h += p.vh * dt;
      p.vx *= 1 - dt * 1.5; p.vy *= 1 - dt * 1.5; p.vh *= 1 - dt * 0.8;
      const w = toWorld(p.x, p.y, p.h);
      this.pos[n * 3] = w.x; this.pos[n * 3 + 1] = w.y; this.pos[n * 3 + 2] = w.z;
      const k = p.age / p.life;
      this.al[n] = this.alphaMax * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      this.sz[n] = p.s * (1 + k * 1.6);
      n++;
    }
    const g = this.pts.geometry;
    g.setDrawRange(0, n);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    this.pts.visible = n > 0;
  }
}

// ---------------- 潰逃波及圈 ----------------
// 部隊潰逃時，從原地擴散到「友軍潰逃」影響半徑的紅色圓環
type Pulse = { mesh: THREE.Mesh; t: number; r: number; life: number };
export class Pulses {
  private list: Pulse[] = [];
  private geo = new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2);
  constructor(private scene: THREE.Scene) {}
  add(x: number, y: number, r: number, color: string, life = 1.1) {
    const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    mesh.position.copy(toWorld(x, y)).add(new THREE.Vector3(0, 0.7, 0)); mesh.renderOrder = 4;
    this.scene.add(mesh); this.list.push({ mesh, t: 0, r, life });
  }
  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]; p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { this.scene.remove(p.mesh); (p.mesh.material as THREE.Material).dispose(); this.list.splice(i, 1); continue; }
      const e = 1 - (1 - k) ** 3;
      p.mesh.scale.setScalar(Math.max(1, p.r * e));
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    }
  }
}

// ---------------- 正面／側面／背面扇區 ----------------
// 地面上的圓環，依部隊朝向分成三色：正面 ±60° 淡色、側面 琥珀、背面 紅
export class FacingDisc {
  mesh: THREE.Mesh;
  constructor(scene: THREE.Scene) {
    const g = new THREE.RingGeometry(0.84, 1, 72, 1).rotateX(-Math.PI / 2).toNonIndexed();
    const p = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const front = new THREE.Color('#efe6d2'), flank = new THREE.Color('#e0a24a'), rear = new THREE.Color('#d9483b');
    for (let t = 0; t < p.count; t += 3) {
      // 以三角形中心判斷扇區，避免同一片三角形跨兩色
      const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3, cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
      const a = Math.abs(Math.atan2(cx, cz)); // 與模型正面 +z 的夾角
      const c = a <= Math.PI / 3 ? front : a < 2 * Math.PI / 3 ? flank : rear;
      for (let k = 0; k < 3; k++) { col[(t + k) * 3] = c.r; col[(t + k) * 3 + 1] = c.g; col[(t + k) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }));
    this.mesh.renderOrder = 3; this.mesh.visible = false;
    scene.add(this.mesh);
  }
  show(x: number, y: number, f: number, r: number) {
    this.mesh.visible = true;
    this.mesh.position.copy(toWorld(x, y)).add(new THREE.Vector3(0, 0.45, 0));
    this.mesh.rotation.y = yawOf(f);
    this.mesh.scale.setScalar(r);
  }
  hide() { this.mesh.visible = false; }
}
