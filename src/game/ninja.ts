// 忍者顯示：深色小人＋小旗號「忍」；選取圈；施放忍術時顯示 80 m 射程
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { height, type Ninja } from '../sim/sim.ts';
import { toWorld, yawOf } from './coords.ts';

const SIDE = ['#b8322a', '#2f4f86'];

function colored(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color); const n = g.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g;
}
let GEO: THREE.BufferGeometry | null = null;
function figure() {
  if (GEO) return GEO;
  GEO = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.17, 0.22, 0.8, 6).translate(0, 0.4, 0), '#1c1a1d'),
    colored(new THREE.BoxGeometry(0.48, 0.48, 0.3).translate(0, 1.02, 0), '#25222a'),
    colored(new THREE.IcosahedronGeometry(0.16, 0).translate(0, 1.4, 0), '#1c1a1d'),
    colored(new THREE.BoxGeometry(0.03, 0.03, 0.75).rotateX(-0.9).translate(0, 1.25, -0.2), '#9aa0a6'), // 背刀
  ])!;
  return GEO;
}

function bannerTex(side: number, selected: boolean, detected: boolean, manual: boolean) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = selected ? '#f3e7c4' : detected ? '#e0574a' : 'rgba(20,18,16,0.6)';
  g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1f1c22'; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.fill();
  g.strokeStyle = SIDE[side]; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#efe6d2'; g.font = '700 30px "LXGW WenKai TC", "Noto Serif TC", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('忍', 32, 34);
  if (manual) { g.fillStyle = '#c9a227'; g.beginPath(); g.arc(52, 12, 7, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class NinjaView {
  mesh: THREE.Mesh; banner: THREE.Sprite; ring: THREE.Mesh; range: THREE.Mesh;
  selected = false; showRange = false;
  prevX: number; prevY: number; private hd = 0; private ph = 0; private key = '';
  constructor(scene: THREE.Scene, public n: Ninja) {
    this.mesh = new THREE.Mesh(figure(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.mesh.scale.setScalar(1.4); scene.add(this.mesh);
    this.banner = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true, sizeAttenuation: false }));
    this.banner.center.set(0.5, 0); this.banner.renderOrder = 11; scene.add(this.banner);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f3e7c4', transparent: true, depthWrite: false }));
    this.ring.renderOrder = 3; scene.add(this.ring);
    this.range = new THREE.Mesh(new THREE.RingGeometry(78.5, 80, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#c9a227', transparent: true, opacity: 0.8, depthWrite: false }));
    this.range.renderOrder = 3; scene.add(this.range);
    this.prevX = n.x; this.prevY = n.y;
  }
  update(dt: number, alpha: number, visible: boolean, t: number) {
    const n = this.n;
    const x = this.prevX + (n.x - this.prevX) * alpha, y = this.prevY + (n.y - this.prevY) * alpha;
    const show = n.alive && visible;
    this.mesh.visible = show; this.banner.visible = show;
    this.ring.visible = show && this.selected; this.range.visible = show && this.showRange;
    if (!show) return;
    const moving = Math.hypot(n.tx - n.x, n.ty - n.y) > 1;
    if (moving) { this.hd = Math.atan2(n.ty - n.y, n.tx - n.x); this.ph += dt * 14; }
    const p = toWorld(x, y, height(x, y) + (moving ? Math.abs(Math.sin(this.ph)) * 0.1 : 0));
    this.mesh.position.copy(p); this.mesh.rotation.y = yawOf(this.hd);
    this.banner.position.set(p.x, p.y + 4.2, p.z);
    this.ring.position.set(p.x, p.y + 0.4, p.z); this.range.position.set(p.x, p.y + 0.5, p.z);
    const det = n.detUntil > t;
    const key = `${this.selected ? 1 : 0}${det ? 1 : 0}${n.manual ? 1 : 0}`;
    if (key !== this.key) {
      this.key = key; const m = this.banner.material as THREE.SpriteMaterial; m.map?.dispose();
      m.map = bannerTex(n.side, this.selected, det, !!n.manual); m.needsUpdate = true;
    }
  }
  setBannerScale(h: number) { const k = Math.min(0.05, 30 / h); this.banner.scale.set(k, k, 1); }
}

// 煙霧（霧隱）與物見範圍
export class AreaFx {
  private items = new Map<string, THREE.Mesh>();
  constructor(private scene: THREE.Scene) {}
  sync(list: { key: string; x: number; y: number; r: number; color: string; opacity: number }[]) {
    const seen = new Set<string>();
    for (const a of list) {
      seen.add(a.key);
      let m = this.items.get(a.key);
      if (!m) {
        m = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: a.color, transparent: true, opacity: a.opacity, depthWrite: false }));
        m.renderOrder = 2; this.scene.add(m); this.items.set(a.key, m);
        m.position.copy(toWorld(a.x, a.y)).add(new THREE.Vector3(0, 0.7, 0)); m.scale.setScalar(a.r);
      }
    }
    for (const [k, m] of this.items) if (!seen.has(k)) { this.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); this.items.delete(k); }
  }
}
