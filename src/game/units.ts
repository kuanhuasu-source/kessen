// 部隊顯示：每名士兵一個 instance，依陣型槽位跟隨部隊中心
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { UT, type UType } from '../sim/data.ts';
import { height, type Unit } from '../sim/sim.ts';
import { toWorld, yawOf, rng } from './coords.ts';
import { kamonImg, artVersion } from './art.ts';

const VISUAL_SCALE = 1.4; // 士兵略為放大，遠景時比較看得清楚
export const KANJI: Record<UType, string> = { spear: '槍', archer: '弓', samurai: '侍', cav: '騎', general: '將' };
export const TYPE_NAME: Record<UType, string> = { spear: '長槍足輕', archer: '弓足輕', samurai: '武士刀武士', cav: '騎馬武士', general: '大將旗本' };
const SIDE_COLOR = ['#b8322a', '#2f4f86'];
const SIDE_DARK = ['#3a2622', '#22293a'];

function colored(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color); const n = g.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g;
}

function infantry(type: UType, side: number) {
  const lac = SIDE_COLOR[side], dark = SIDE_DARK[side];
  const parts = [
    colored(new THREE.CylinderGeometry(0.2, 0.26, 0.85, 6).translate(0, 0.43, 0), dark),
    colored(new THREE.BoxGeometry(0.55, 0.5, 0.34).translate(0, 1.08, 0), lac),
    colored(new THREE.IcosahedronGeometry(0.17, 0).translate(0, 1.47, 0), '#d6b48c'),
    // 背旗（旗指物）
    colored(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 4).translate(0, 1.85, -0.22), '#3b2f25'),
    colored(new THREE.BoxGeometry(0.03, 0.62, 0.34).translate(0, 2.2, -0.4), lac),
  ];
  if (type === 'samurai') {
    parts.push(colored(new THREE.ConeGeometry(0.24, 0.26, 6).translate(0, 1.62, 0), '#1f1b18'));
    parts.push(colored(new THREE.BoxGeometry(0.34, 0.06, 0.04).translate(0, 1.72, 0.12), '#c9a227'));
    parts.push(colored(new THREE.BoxGeometry(0.05, 0.05, 0.95).rotateX(-0.5).translate(0.32, 0.9, 0.25), '#bfc4c8'));
  } else {
    parts.push(colored(new THREE.ConeGeometry(0.36, 0.16, 8).translate(0, 1.64, 0), '#3a332c')); // 陣笠
  }
  if (type === 'spear') parts.push(colored(new THREE.CylinderGeometry(0.025, 0.025, 4.2, 4).rotateX(0.18).translate(0.3, 2.0, 0.2), '#6b4b32'));
  if (type === 'archer') parts.push(colored(new THREE.TorusGeometry(0.7, 0.025, 3, 10, Math.PI).rotateZ(Math.PI / 2).translate(-0.3, 1.2, 0.1), '#4a3020'));
  return mergeGeometries(parts)!;
}

function mounted(type: UType, side: number) {
  const lac = SIDE_COLOR[side], dark = SIDE_DARK[side], horse = type === 'general' ? '#2b211b' : '#5a3d2a';
  const parts = [
    colored(new THREE.BoxGeometry(0.6, 0.7, 1.9).translate(0, 1.25, 0), horse),
    colored(new THREE.BoxGeometry(0.34, 0.9, 0.4).rotateX(-0.6).translate(0, 1.75, 0.95), horse),
    colored(new THREE.BoxGeometry(0.28, 0.3, 0.6).translate(0, 2.0, 1.3), horse),
    ...[[-0.2, -0.7], [0.2, -0.7], [-0.2, 0.7], [0.2, 0.7]].map(([x, z]) => colored(new THREE.BoxGeometry(0.14, 0.95, 0.14).translate(x, 0.47, z), horse)),
    colored(new THREE.BoxGeometry(0.5, 0.55, 0.32).translate(0, 2.0, -0.05), lac),
    colored(new THREE.CylinderGeometry(0.17, 0.2, 0.45, 6).translate(0, 1.62, -0.05), dark),
    colored(new THREE.IcosahedronGeometry(0.16, 0).translate(0, 2.42, -0.05), '#d6b48c'),
    colored(new THREE.ConeGeometry(0.22, 0.24, 6).translate(0, 2.58, -0.05), '#1f1b18'),
    colored(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 4).translate(0, 2.85, -0.3), '#3b2f25'),
    colored(new THREE.BoxGeometry(0.03, 0.7, 0.4).translate(0, 3.25, -0.5), type === 'general' ? '#c9a227' : lac),
    colored(new THREE.CylinderGeometry(0.025, 0.025, 3.4, 4).rotateX(1.25).translate(0.32, 2.1, 0.9), '#6b4b32'),
  ];
  return mergeGeometries(parts)!;
}

export type BannerState = 'high' | 'steady' | 'waver' | 'rout' | 'regroup';
// intel：0 看不到、1 察覺（只知道有敵軍）、2 識別（兵種、概略士氣）、3 洞悉（確切士氣）
function bannerTexture(type: UType, side: number, morale: number, selected: boolean, st: BannerState = 'steady', engaged = false, intel = 3) {
  const routing = st === 'rout';
  if (intel === 1) {
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 136;
    const g = cv.getContext('2d')!;
    g.fillStyle = 'rgba(20,18,16,0.45)'; g.beginPath(); g.roundRect(4, 4, 88, 104, 10); g.fill();
    g.strokeStyle = SIDE_COLOR[side]; g.lineWidth = 5; g.setLineDash([10, 7]); g.beginPath(); g.roundRect(12, 12, 72, 88, 7); g.stroke();
    g.fillStyle = '#d8cfbd'; g.font = '700 54px "LXGW WenKai TC", "Noto Serif TC", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', 48, 58);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 136;
  const g = cv.getContext('2d')!;
  g.fillStyle = selected ? '#f3e7c4' : st === 'waver' ? '#d0803c' : 'rgba(20,18,16,0.55)';
  g.beginPath(); g.roundRect(4, 4, 88, 104, 10); g.fill();
  g.fillStyle = routing ? '#6b645a' : SIDE_COLOR[side];
  g.beginPath(); g.roundRect(10, 10, 76, 92, 7); g.fill();
  // 家紋淡淡印在旗面上（Gemini 美術；還沒載入時略過）
  const km = kamonImg[side];
  if (km && !routing) { g.globalAlpha = 0.26; g.drawImage(km, 16, 22, 64, 64); g.globalAlpha = 1; }
  g.fillStyle = '#f6efe0'; g.font = '700 58px "LXGW WenKai TC", "Noto Serif TC", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(routing ? '潰' : KANJI[type], 48, 58);
  // 角標：昂（士氣高昂）、搖（動搖）、整（重整中）、交戰中的交叉刀
  const tag = st === 'high' ? '昂' : st === 'waver' ? '搖' : st === 'regroup' ? '整' : '';
  if (tag) {
    g.fillStyle = st === 'high' ? '#c9a227' : st === 'waver' ? '#d0803c' : '#7a8a9a';
    g.beginPath(); g.arc(78, 18, 15, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1a17'; g.font = '700 20px "LXGW WenKai TC", "Noto Serif TC", serif'; g.fillText(tag, 78, 19);
  }
  if (engaged && !routing) {
    g.strokeStyle = '#f6efe0'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(10, 10); g.lineTo(30, 30); g.moveTo(30, 10); g.lineTo(10, 30); g.stroke();
  }
  // 士氣條
  g.fillStyle = 'rgba(20,18,16,0.75)'; g.fillRect(8, 114, 80, 14);
  if (intel === 2) morale = st === 'high' ? 90 : st === 'waver' ? 37 : st === 'rout' ? 10 : 65; // 只知道概略狀態
  g.fillStyle = morale >= 80 ? '#7fb36a' : morale >= 50 ? '#c9b458' : morale >= 25 ? '#d0803c' : '#c0392b';
  g.fillRect(10, 116, 76 * Math.max(0, Math.min(1, morale / 100)), 10);
  if (intel === 2) { g.fillStyle = 'rgba(20,18,16,0.55)'; for (let x = 12; x < 86; x += 8) g.fillRect(x, 116, 3, 10); }
  if (intel === 3 && side === 1) { // 洞悉標記
    g.fillStyle = '#c9a227'; g.beginPath(); g.arc(18, 96, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1a17'; g.beginPath(); g.ellipse(18, 96, 6, 3.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9a227'; g.beginPath(); g.arc(18, 96, 1.8, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type Death = { at: number; n: number; x: number; y: number; arrow: boolean };
export type CorpseSink = (key: string, geo: THREE.BufferGeometry, cav: boolean, x: number, y: number, hd: number, dir: number) => void;

export class UnitView {
  u: Unit;
  mesh: THREE.InstancedMesh;
  banner: THREE.Sprite;
  ring: THREE.Mesh;
  dest: THREE.Group;
  px: Float32Array; py: Float32Array; hd: Float32Array; ph: Float32Array; jx: Float32Array; jy: Float32Array;
  prevX: number; prevY: number; prevF: number;
  selected = false;
  geo: THREE.BufferGeometry;
  alive: number;                 // 畫面上還站著的士兵數（陣亡動畫會比模擬晚一點）
  private deaths: Death[] = [];
  private ox = 0; private oy = 0; // 接戰時往敵方靠攏的位移（只影響畫面）
  private scatter = 1;
  private lastBanner = '';
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private sc = new THREE.Vector3(VISUAL_SCALE, VISUAL_SCALE, VISUAL_SCALE);
  private up = new THREE.Vector3(0, 1, 0); private ax = new THREE.Vector3(1, 0, 0); private q2 = new THREE.Quaternion();
  galloping = false;

  constructor(scene: THREE.Scene, u: Unit) {
    this.u = u;
    const geo = UT[u.type].cav ? mounted(u.type, u.side) : infantry(u.type, u.side);
    this.geo = geo; this.alive = u.men;
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), u.men0);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    const n = u.men0, R = rng(1000 + u.id * 77);
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.hd = new Float32Array(n); this.ph = new Float32Array(n);
    this.jx = new Float32Array(n); this.jy = new Float32Array(n);
    this.prevX = u.x; this.prevY = u.y; this.prevF = u.f;
    for (let i = 0; i < n; i++) {
      this.jx[i] = (R() - 0.5) * 0.5; this.jy[i] = (R() - 0.5) * 0.5; this.ph[i] = R() * 6.28;
      const s = this.slot(i, u.x, u.y, u.f); this.px[i] = s.x; this.py[i] = s.y; this.hd[i] = u.f;
    }
    this.banner = new THREE.Sprite(new THREE.SpriteMaterial({ map: bannerTexture(u.type, u.side, 100, false), depthTest: false, transparent: true, sizeAttenuation: false }));
    this.banner.renderOrder = 10; this.banner.center.set(0.5, 0);
    this.banner.userData.unitId = u.id;
    scene.add(this.banner);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#f3e7c4', transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.renderOrder = 3; this.ring.visible = false; scene.add(this.ring);
    this.dest = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 4), new THREE.MeshBasicMaterial({ color: '#f3e7c4' }));
    pole.position.y = 3;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshBasicMaterial({ color: SIDE_COLOR[u.side], side: THREE.DoubleSide }));
    flag.position.set(1.1, 5.2, 0);
    this.dest.add(pole, flag); this.dest.visible = false; scene.add(this.dest);
  }

  // 第 i 名士兵在陣型中的位置（模擬座標）
  slot(i: number, cx: number, cy: number, f: number) {
    const u = this.u;
    const files = Math.max(1, Math.ceil(u.men / u.ranks));
    const file = i % files, rank = Math.floor(i / files);
    const fx = Math.cos(f), fy = Math.sin(f), rx = Math.sin(f), ry = -Math.cos(f);
    const lat = (file - (files - 1) / 2) * u.sp + this.jx[i] * u.sp * this.scatter;
    const back = (rank - (u.ranks - 1) / 2) * u.sp * (UT[u.type].cav ? 1.6 : 1) + this.jy[i] * u.sp * this.scatter;
    return { x: cx + rx * lat - fx * back, y: cy + ry * lat - fy * back };
  }

  center(alpha: number) {
    const u = this.u;
    return { x: this.prevX + (u.x - this.prevX) * alpha, y: this.prevY + (u.y - this.prevY) * alpha };
  }

  snap() { for (let i = 0; i < this.alive; i++) { const s = this.slot(i, this.u.x, this.u.y, this.u.f); this.px[i] = s.x; this.py[i] = s.y; this.hd[i] = this.u.f; } }
  // 模擬扣掉 n 人；在模擬時間 at 時倒下（箭矢要等落地）
  kill(n: number, at: number, x: number, y: number, arrow: boolean) { if (n > 0) this.deaths.push({ at, n, x, y, arrow }); }
  pending() { let k = 0; for (const d of this.deaths) k += d.n; return k; }
  // 衝鋒撞擊：把 (x,y) 附近的士兵往 (dx,dy) 方向推開
  push(x: number, y: number, dx: number, dy: number, r: number) {
    for (let i = 0; i < this.alive; i++) {
      const d = Math.hypot(this.px[i] - x, this.py[i] - y); if (d > r) continue;
      const k = (1 - d / r) * (2 + Math.random() * 2.5);
      this.px[i] += dx * k; this.py[i] += dy * k;
    }
  }
  private removeSoldier(k: number, dirX: number, dirY: number, sink: CorpseSink) {
    const u = this.u, cav = UT[u.type].cav;
    // 倒向：被打的方向（遠離攻擊者）
    const away = Math.cos(Math.atan2(dirY, dirX) - this.hd[k]);
    const dir = cav ? (Math.random() < 0.5 ? 1 : -1) : (away >= 0 ? -1 : 1);
    sink(`${u.type}${u.side}`, this.geo, cav, this.px[k], this.py[k], this.hd[k], dir);
    const n = this.alive - 1;
    for (const arr of [this.px, this.py, this.hd, this.ph, this.jx, this.jy]) arr.copyWithin(k, k + 1, n + 1);
    this.alive = n;
  }
  private processDeaths(simT: number, sink: CorpseSink) {
    const u = this.u;
    // 保險：沒登記到的傷亡立刻倒下
    const extra = this.alive - u.men - this.pending();
    if (extra > 0) this.deaths.push({ at: simT, n: extra, x: u.x, y: u.y, arrow: true });
    if (u.state === 'gone' && u.hp > 0) { this.deaths.length = 0; return; } // 逃離戰場，不算陣亡
    if (!this.deaths.length) return;
    const keep: Death[] = [];
    for (const d of this.deaths) {
      if (d.at > simT) { keep.push(d); continue; }
      for (let j = 0; j < d.n && this.alive > 0; j++) {
        let k: number;
        if (d.arrow) k = Math.floor(Math.random() * this.alive);
        else {
          // 近戰：離攻擊者最近的士兵先倒
          k = 0; let bd = 1e9;
          const tries = Math.min(this.alive, 24);
          for (let t = 0; t < tries; t++) {
            const i = tries === this.alive ? t : Math.floor(Math.random() * this.alive);
            const dd = (this.px[i] - d.x) ** 2 + (this.py[i] - d.y) ** 2;
            if (dd < bd) { bd = dd; k = i; }
          }
        }
        this.removeSoldier(k, this.px[k] - d.x, this.py[k] - d.y, sink);
      }
    }
    this.deaths = keep;
  }

  intel = 3; ghostX = 0; ghostY = 0;
  update(dt: number, alpha: number, morale: number, simT: number, units: Unit[], sink: CorpseSink, intel = 3, ghost?: { x: number; y: number }) {
    this.intel = intel;
    const u = this.u, c0 = this.center(alpha);
    this.processDeaths(simT, sink);
    const routing = u.state === 'rout' || u.state === 'shattered';
    const fled = u.state === 'gone' && u.hp > 0;
    // 接戰：雙方正面靠攏到接觸距離
    let tx = 0, ty = 0, E: Unit | null = null;
    if (u.contacts.length && !routing) {
      const pid = u.contacts.includes(u.primary) ? u.primary : u.contacts[0];
      E = units[pid];
      const d = Math.hypot(E.x - u.x, E.y - u.y) || 1, dx = (E.x - u.x) / d, dy = (E.y - u.y) / d;
      const ext = (v: Unit, ax: number, ay: number) => {
        const a = Math.atan2(ay, ax) - v.f;
        return Math.abs(Math.cos(a)) * v.depth / 2 + Math.abs(Math.sin(a)) * v.width / 2;
      };
      const gap = d - ext(u, dx, dy) - ext(E, -dx, -dy) - 0.6;
      if (gap > 0) {
        const eP = E.contacts.includes(E.primary) ? E.primary : E.contacts[0];
        const share = eP === u.id ? 0.5 : 1;
        const m = Math.min(14, gap * share);
        tx = dx * m; ty = dy * m;
      }
    }
    const kk = 1 - Math.exp(-dt * 2.5);
    this.ox += (tx - this.ox) * kk; this.oy += (ty - this.oy) * kk;
    this.scatter += ((routing ? 3.2 : 1) - this.scatter) * (1 - Math.exp(-dt * 0.8));
    const c = { x: c0.x + this.ox, y: c0.y + this.oy };
    const running = (u.hasDest && u.run) || routing;
    const cav = UT[u.type].cav;
    this.galloping = cav && running && u.hasDest && !u.contacts.length && u.state !== 'gone';
    const vmax = UT[u.type].speed * (running ? 1.25 : 0.85) + 0.6;
    const n = this.alive;
    // 前排判定用
    let fdx = 0, fdy = 0, frontAt = 1e9;
    if (E) {
      const d = Math.hypot(E.x - c.x, E.y - c.y) || 1; fdx = (E.x - c.x) / d; fdy = (E.y - c.y) / d;
      const a = Math.atan2(fdy, fdx) - u.f;
      frontAt = Math.abs(Math.cos(a)) * u.depth / 2 + Math.abs(Math.sin(a)) * u.width / 2 - 2.2 * u.sp;
    }
    for (let i = 0; i < n; i++) {
      const s = this.slot(i, c.x, c.y, u.f);
      let dx = s.x - this.px[i], dy = s.y - this.py[i];
      const d = Math.hypot(dx, dy);
      let moving = false;
      if (d > 0.05) {
        const step = Math.min(d, vmax * dt * (d > 4 ? 1.6 : 1));
        this.px[i] += dx / d * step; this.py[i] += dy / d * step;
        moving = d > 0.4;
        if (moving) { const want = Math.atan2(dy, dx); this.hd[i] = turn(this.hd[i], want, 6 * dt); }
      }
      let lx = 0, ly = 0, lh = 0;
      const front = E !== null && (this.px[i] - c.x) * fdx + (this.py[i] - c.y) * fdy > frontAt;
      if (front) {
        // 前排出手：朝敵方刺擊
        this.ph[i] += dt * (5 + (i % 5));
        const k = Math.max(0, Math.sin(this.ph[i]));
        lx = fdx * k * 0.5; ly = fdy * k * 0.5; lh = k * 0.08;
        this.hd[i] = turn(this.hd[i], Math.atan2(fdy, fdx), 4 * dt);
      } else if (!moving) this.hd[i] = turn(this.hd[i], u.f, 3 * dt);
      const gallop = cav && moving && running && !front;
      if (moving && !front) this.ph[i] += dt * (gallop ? 17 : running ? 14 : 9);
      const bob = gallop ? Math.abs(Math.sin(this.ph[i])) * 0.32 : moving ? Math.abs(Math.sin(this.ph[i])) * 0.12 : lh;
      const x = this.px[i] + lx, y = this.py[i] + ly;
      const p = toWorld(x, y, height(x, y) + bob);
      this.q.setFromAxisAngle(this.up, yawOf(this.hd[i]));
      if (gallop) { this.q2.setFromAxisAngle(this.ax, Math.sin(this.ph[i]) * 0.14); this.q.multiply(this.q2); } // 奔馳時前後起伏
      this.m.compose(p, this.q, this.sc);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    // 部隊旗號
    const top = toWorld(c.x, c.y);
    this.banner.position.set(top.x, top.y + (UT[u.type].cav ? 9 : 7.5), top.z);
    const gone = u.state === 'gone';
    this.mesh.visible = !fled && n > 0 && intel >= 2; this.banner.visible = !gone && intel >= 1;
    if (intel === 1 && ghost) {
      // 察覺：旗號在概略位置緩慢漂移
      const k = 1 - Math.exp(-dt * 1.5);
      this.ghostX += (ghost.x - this.ghostX) * k; this.ghostY += (ghost.y - this.ghostY) * k;
      if (Math.hypot(ghost.x - this.ghostX, ghost.y - this.ghostY) > 120) { this.ghostX = ghost.x; this.ghostY = ghost.y; }
      const g = toWorld(this.ghostX, this.ghostY); this.banner.position.set(g.x, g.y + 7.5, g.z);
    } else { this.ghostX = c.x; this.ghostY = c.y; }
    const st: BannerState = routing ? 'rout' : u.retreating ? 'regroup' : u.state === 'high' ? 'high' : u.state === 'waver' ? 'waver' : 'steady';
    const engaged = u.contacts.length > 0;
    const key = `${intel === 3 ? Math.round(morale / 4) : 0}|${this.selected ? 1 : 0}|${st}|${engaged ? 1 : 0}|${intel}|${artVersion}`;
    if (key !== this.lastBanner) {
      this.lastBanner = key;
      const mat = this.banner.material as THREE.SpriteMaterial; mat.map?.dispose();
      mat.map = bannerTexture(u.type, u.side, morale, this.selected, st, engaged && intel >= 2, intel); mat.needsUpdate = true;
    }
    // 選取框
    this.ring.visible = this.selected && !gone;
    if (this.ring.visible) {
      this.ring.position.set(top.x, top.y + 0.4, top.z);
      this.ring.scale.set(u.width / 2 + 3, 1, u.depth / 2 + 3);
      this.ring.rotation.y = yawOf(u.f);
    }
    this.dest.visible = this.selected && u.hasDest && !gone;
    if (this.dest.visible) this.dest.position.copy(toWorld(u.destX, u.destY));
  }

  setBannerScale(screenH: number) {
    const k = Math.min(0.075, 46 / screenH); // 旗號固定大小（佔畫面高度的比例）
    this.banner.scale.set(k * 96 / 136, k, 1);
  }
}

function turn(a: number, b: number, rate: number) {
  let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  return a + Math.max(-rate, Math.min(rate, d));
}
