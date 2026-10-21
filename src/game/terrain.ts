// 戰場：地形高度、地表顏色、森林、稻田、三個據點
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP } from '../sim/data.ts';
import { height, inForest } from '../sim/sim.ts';
import { toWorld, rng } from './coords.ts';
import { GROUND, groundH, riverAt, paintGround, groundTexture } from './ground.ts';

export const FACTION = { 0: new THREE.Color('#b8322a'), 1: new THREE.Color('#2f4f86'), neutral: new THREE.Color('#e9e2cf') };

function colored(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color); const n = g.attributes.position.count; const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}
const lambert = (opts: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts });

export type Terrain = {
  ground: THREE.Mesh;
  setOwner: (i: number, owner: -1 | 0 | 1, progress: number, progSide: -1 | 0 | 1) => void;
  // 顯示已探明的地形秘密：沼澤、森林小徑、伏兵地
  reveal: (kind: 'marsh' | 'trail' | 'ambush', x: number, y: number) => void;
  // 未探索遮罩（情報 v2）：explored 是 40×28 格（每格 25 m）的已探索旗標；null 表示關閉
  shroud: (explored: Uint8Array | null) => void;
};

// 依地形起伏貼地的圓盤（中心 x,y，半徑 r）
function drape(x: number, y: number, r: number, lift: number, map: THREE.Texture, opacity = 1) {
  const g = new THREE.CircleGeometry(r, 40, 0, Math.PI * 2); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const sx = x + p.getX(i), sy = y - p.getZ(i); p.setX(i, sx - 500); p.setZ(i, 350 - sy); p.setY(i, height(sx, sy) + lift); }
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false }));
}
function marshTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d')!; const R = rng(7);
  const grd = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  grd.addColorStop(0, 'rgba(58,62,44,0.95)'); grd.addColorStop(0.75, 'rgba(70,74,50,0.85)'); grd.addColorStop(1, 'rgba(70,74,50,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) { // 水窪
    const a = R() * 6.28, d = R() * 80; g.fillStyle = `rgba(96,118,120,${0.35 + R() * 0.3})`;
    g.beginPath(); g.ellipse(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 6 + R() * 16, 3 + R() * 8, R() * 3, 0, 6.28); g.fill();
  }
  g.strokeStyle = 'rgba(150,150,90,0.8)'; g.lineWidth = 1.5; // 蘆葦
  for (let i = 0; i < 160; i++) { const a = R() * 6.28, d = R() * 100, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d; g.beginPath(); g.moveTo(x, y); g.lineTo(x + R() * 4 - 2, y - 5 - R() * 5); g.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function ringTexture(color: string) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(20,24,14,0.28)'; g.beginPath(); g.arc(128, 128, 124, 0, 6.28); g.fill();
  g.strokeStyle = color; g.lineWidth = 5; g.setLineDash([14, 10]); g.beginPath(); g.arc(128, 128, 120, 0, 6.28); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildTerrain(scene: THREE.Scene, streams: string = 'none'): Terrain {
  const R = rng(20261021);
  // ---- 地面：含外圍原野與兩條河的一整片平面，貼合成貼圖（ground.ts） ----
  const GW = GROUND.x1 - GROUND.x0, GH = GROUND.y1 - GROUND.y0;
  const geo = new THREE.PlaneGeometry(GW, GH, 320, 260);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    // 平面中心在世界原點 = 模擬 (500,350)；延伸區不對稱，所以用 uv 對應合成貼圖
    const x = pos.getX(i) + (GROUND.x0 + GROUND.x1) / 2, y = (GROUND.y0 + GROUND.y1) / 2 - pos.getZ(i);
    pos.setX(i, x - 500); pos.setZ(i, 350 - y);
    pos.setY(i, groundH(x, y, height(x, y), streams) + (R() - 0.5) * 0.3);
    uv.setXY(i, (x - GROUND.x0) / GW, (y - GROUND.y0) / GH);
  }
  geo.computeVertexNormals();
  const groundMat = new THREE.MeshLambertMaterial({ color: '#7f8f4e' });
  const ground = new THREE.Mesh(geo, groundMat);
  ground.name = 'ground';
  scene.add(ground);
  paintGround(streams).then(cv => { groundMat.map = groundTexture(cv); groundMat.color.set('#ffffff'); groundMat.needsUpdate = true; });
  // 遠山：地平線上幾座淡藍的山影
  { const mats = new THREE.MeshBasicMaterial({ color: '#8a9aa6', fog: true });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + R() * 0.3, d = 1500 + R() * 300, w = 500 + R() * 500, h = 90 + R() * 120;
      const mnt = new THREE.Mesh(new THREE.ConeGeometry(w / 2, h, 5).translate(0, h / 2 - 8, 0), mats);
      mnt.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); mnt.scale.set(1, 1, 0.35); mnt.lookAt(0, 0, 0); scene.add(mnt);
    }
  }

  // ---- 森林 ----
  const trunk = colored(new THREE.CylinderGeometry(0.25, 0.35, 3, 5).translate(0, 1.5, 0), '#5a4330');
  const crownA = colored(new THREE.ConeGeometry(2.6, 5, 6).translate(0, 4.5, 0), '#2f4a26');
  const crownB = colored(new THREE.ConeGeometry(1.9, 4, 6).translate(0, 7, 0), '#3a5a2c');
  const treeGeo = mergeGeometries([trunk, crownA, crownB])!;
  const trees: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const f = MAP.forest;
  for (let i = 0; i < 1400 && trees.length < 750; i++) {
    const x = f.x0 + R() * (f.x1 - f.x0), y = f.y0 + R() * (f.y1 - f.y0);
    if (R() < 0.15) continue;
    const k = 0.8 + R() * 0.7;
    trees.push(m.clone().compose(toWorld(x, y), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28), s.set(k, k * (0.9 + R() * 0.3), k)));
  }
  // 原野上零星的樹
  for (let i = 0; i < 90; i++) {
    const x = R() * 1000, y = R() * 700;
    if (inForest(x, y) || MAP.points.some(pt => Math.hypot(pt.x - x, pt.y - y) < 70) || (y > 200 && y < 500 && x > 600 && x < 860) || (Math.abs(x - 500) < 140 && (y < 180 || y > 520))) continue;
    const k = 0.7 + R() * 0.6;
    trees.push(m.clone().compose(toWorld(x, y), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28), s.set(k, k, k)));
  }
  // 外圍原野：河岸的樹帶、零星樹叢（畫面用，不影響模擬）
  for (let i = 0; i < 900 && trees.length < 1500; i++) {
    const x = GROUND.x0 + R() * (GROUND.x1 - GROUND.x0), y = GROUND.y0 + R() * (GROUND.y1 - GROUND.y0);
    if (x > -20 && x < 1020 && y > -20 && y < 720) continue;
    const r = riverAt(x, y); const bank = r.d > r.w / 2 + 6 && r.d < r.w / 2 + 40;
    if (r.d <= r.w / 2 + 6) continue;
    if (!bank && R() < 0.75) continue;
    const k = 0.8 + R() * 0.8;
    const w = toWorld(x, y); w.y = groundH(x, y, height(x, y));
    trees.push(m.clone().compose(w, q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28), s.set(k, k * (0.9 + R() * 0.3), k)));
  }
  // 灌木與石頭
  { const bushGeo = colored(new THREE.IcosahedronGeometry(1.1, 0).scale(1, 0.65, 1).translate(0, 0.6, 0), '#4f6a35');
    const rockGeo = colored(new THREE.DodecahedronGeometry(0.9, 0).scale(1.3, 0.7, 1).translate(0, 0.4, 0), '#8c8778');
    const bushes: THREE.Matrix4[] = [], rocks: THREE.Matrix4[] = [];
    for (let i = 0; i < 700; i++) {
      const x = GROUND.x0 + 40 + R() * (GROUND.x1 - GROUND.x0 - 80), y = GROUND.y0 + 40 + R() * (GROUND.y1 - GROUND.y0 - 80);
      if (riverAt(x, y).d < riverAt(x, y).w / 2 + 8) continue;
      if ((x > MAP.paddy.x0 - 5 && x < MAP.paddy.x1 + 5 && y > MAP.paddy.y0 - 5 && y < MAP.paddy.y1 + 5) || MAP.points.some(pt => Math.hypot(pt.x - x, pt.y - y) < 48)) continue;
      if (Math.abs(x - 500) < 12 && y > -300 && y < 1000) continue; // 南北大路
      const k = 0.6 + R() * 1.1; const w = toWorld(x, y); w.y = groundH(x, y, height(x, y));
      (R() < 0.8 ? bushes : rocks).push(m.clone().compose(w, q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28), s.set(k, k, k)));
    }
    const bm = new THREE.InstancedMesh(bushGeo, lambert(), bushes.length); bushes.forEach((mm, i) => bm.setMatrixAt(i, mm)); scene.add(bm);
    const rm = new THREE.InstancedMesh(rockGeo, lambert(), rocks.length); rocks.forEach((mm, i) => rm.setMatrixAt(i, mm)); scene.add(rm);
  }
  const forest = new THREE.InstancedMesh(treeGeo, lambert(), trees.length);
  trees.forEach((mm, i) => forest.setMatrixAt(i, mm));
  scene.add(forest);
  const treeX = trees.map(mm => new THREE.Vector3().setFromMatrixPosition(mm).x + 500);

  // ---- 據點 ----
  const roofDark = '#4b3b2e', wall = '#d9cdb0', wood = '#6b4b32', red = '#b03a2e', thatch = '#a88d55';
  const house = (w: number, d: number, h: number, roof: string) => mergeGeometries([
    colored(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), wall),
    colored(new THREE.ConeGeometry(Math.hypot(w, d) / 2 + 0.6, h * 0.9, 4).rotateY(Math.PI / 4).scale(1, 1, d / w).translate(0, h + h * 0.45, 0), roof),
  ])!;
  const place = (geo: THREE.BufferGeometry, x: number, y: number, rot = 0) => {
    const mesh = new THREE.Mesh(geo, lambert()); mesh.position.copy(toWorld(x, y)); mesh.rotation.y = rot; scene.add(mesh); return mesh;
  };
  // 寺廟（山頂）
  place(colored(new THREE.BoxGeometry(22, 1.2, 16).translate(0, 0.6, 0), '#a59a86'), 500, 352);
  place(house(14, 10, 5, roofDark), 500, 355);
  const torii = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.35, 0.35, 6, 6).translate(-3, 3, 0), red),
    colored(new THREE.CylinderGeometry(0.35, 0.35, 6, 6).translate(3, 3, 0), red),
    colored(new THREE.BoxGeometry(8.5, 0.6, 0.8).translate(0, 6.2, 0), '#2a2420'),
    colored(new THREE.BoxGeometry(7, 0.4, 0.5).translate(0, 5.1, 0), red),
  ])!;
  place(torii, 500, 336);
  // 村落
  for (const [dx, dy, r, w] of [[-14, -10, 0.2, 8], [6, -14, -0.3, 7], [16, 4, 0.5, 9], [-6, 10, 0.1, 7], [-20, 8, -0.2, 6], [10, 18, 0.3, 6]] as const)
    place(house(w, w * 0.7, 3, thatch), 320 + dx, 350 + dy, r);
  // 補給點
  for (let i = 0; i < 9; i++) place(colored(new THREE.BoxGeometry(1.6, 1.2, 1.6).translate(0, 0.6, 0), wood), 884 + (i % 3) * 2.2, 340 + Math.floor(i / 3) * 2.2, 0.2);
  for (const [dx, dy] of [[-12, 8], [12, 10], [0, 18]] as const)
    place(colored(new THREE.ConeGeometry(4, 4, 4).translate(0, 2, 0), '#d8d0bb'), 890 + dx, 350 + dy, 0.6);

  // 佔領範圍與旗幟
  const rings: THREE.Mesh[] = [], flags: THREE.Mesh[] = [], prog: THREE.Mesh[] = [], labels: THREE.Sprite[] = [];
  const LABEL = [['村落', '援軍'], ['寺廟', '士氣 +10'], ['補給點', '箭矢']];
  const labelTex = (i: number, owner: number) => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const g = cv.getContext('2d')!;
    g.fillStyle = owner === 0 ? 'rgba(150,40,34,0.85)' : owner === 1 ? 'rgba(38,64,110,0.85)' : 'rgba(20,18,16,0.6)';
    g.beginPath(); g.roundRect(4, 8, 248, 48, 12); g.fill();
    g.fillStyle = '#f6efe0'; g.font = '700 30px "LXGW WenKai TC", "Noto Serif TC", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`${LABEL[i][0]}・${LABEL[i][1]}`, 128, 33);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const labelOwner: number[] = [];
  MAP.points.forEach(pt => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(MAP.pointR - 1.2, MAP.pointR, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: FACTION.neutral, transparent: true, opacity: 0.55, depthWrite: false }));
    ring.position.copy(toWorld(pt.x, pt.y)).add(new THREE.Vector3(0, 0.6, 0));
    ring.renderOrder = 2; scene.add(ring); rings.push(ring);
    const pr = new THREE.Mesh(new THREE.RingGeometry(MAP.pointR - 3.5, MAP.pointR - 1.6, 64, 1, 0, 0.001).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: FACTION.neutral, transparent: true, opacity: 0.8, depthWrite: false }));
    pr.position.copy(ring.position); pr.renderOrder = 2; scene.add(pr); prog.push(pr);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 12, 5), new THREE.MeshLambertMaterial({ color: '#3b2f25' }));
    pole.position.copy(toWorld(pt.x + 18, pt.y + 18)).add(new THREE.Vector3(0, 6, 0)); scene.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.5), new THREE.MeshLambertMaterial({ color: FACTION.neutral, side: THREE.DoubleSide }));
    flag.position.copy(pole.position).add(new THREE.Vector3(1.3, 3, 0)); scene.add(flag); flags.push(flag);
    const i = labels.length;
    const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(i, -1), depthTest: false, transparent: true, sizeAttenuation: false }));
    lab.center.set(0.5, 0); lab.renderOrder = 9; lab.scale.set(0.15, 0.0375, 1);
    lab.position.copy(pole.position).add(new THREE.Vector3(0, 7, 0)); scene.add(lab); labels.push(lab); labelOwner.push(-1);
  });
  const setOwner = (i: number, owner: -1 | 0 | 1, progress: number, progSide: -1 | 0 | 1) => {
    const colr = owner < 0 ? FACTION.neutral : FACTION[owner];
    if (labelOwner[i] !== owner) { labelOwner[i] = owner; const m = labels[i].material as THREE.SpriteMaterial; m.map?.dispose(); m.map = labelTex(i, owner); m.needsUpdate = true; }
    (rings[i].material as THREE.MeshBasicMaterial).color.copy(colr);
    (flags[i].material as THREE.MeshLambertMaterial).color.copy(colr);
    const p = prog[i];
    p.visible = progSide >= 0 && progress > 0;
    if (p.visible) {
      p.geometry.dispose();
      p.geometry = new THREE.RingGeometry(MAP.pointR - 3.5, MAP.pointR - 1.6, 64, 1, Math.PI / 2, Math.min(1, progress) * Math.PI * 2).rotateX(-Math.PI / 2);
      (p.material as THREE.MeshBasicMaterial).color.copy(FACTION[progSide as 0 | 1]);
    }
  };

  // ---- 光與霧 ----
  scene.background = new THREE.Color('#c8d2d4');
  scene.fog = new THREE.Fog('#c8d2d4', 700, 2100);
  scene.add(new THREE.HemisphereLight('#e6eef2', '#4a4232', 1.25));
  const sun = new THREE.DirectionalLight('#fff0d4', 1.9);
  sun.position.set(-300, 520, 260); scene.add(sun);
  const reveal = (kind: 'marsh' | 'trail' | 'ambush', x: number, y: number) => {
    if (kind === 'marsh') { const d = drape(x, y, MAP.marshR + 4, 0.45, marshTexture()); d.renderOrder = 1; scene.add(d); }
    else if (kind === 'ambush') { const d = drape(x, y, MAP.ambushR, 0.3, ringTexture('#d9c27a'), 0.9); d.renderOrder = 1; scene.add(d); }
    else {
      // 森林小徑：清掉路上的樹，鋪一條土路
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      treeX.forEach((tx, i) => { if (Math.abs(tx - x) <= 8 && i < trees.length) { const p = new THREE.Vector3().setFromMatrixPosition(trees[i]); const sy = 350 - p.z; if (inForest(tx, sy)) forest.setMatrixAt(i, zero); } });
      forest.instanceMatrix.needsUpdate = true;
      const f = MAP.forest, n = 60;
      const g = new THREE.PlaneGeometry(10, f.y1 - f.y0 + 20, 1, n); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const sx = x + p.getX(i), sy = (f.y0 + f.y1) / 2 - p.getZ(i); p.setX(i, sx - 500); p.setZ(i, 350 - sy); p.setY(i, height(sx, sy) + 0.3); }
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#8a7550', transparent: true, opacity: 0.85, depthWrite: false }));
      mesh.renderOrder = 1; scene.add(mesh);
    }
  };
  // ---- 未探索遮罩 ----
  const scv = document.createElement('canvas'); scv.width = 40; scv.height = 28;
  const sg = scv.getContext('2d')!;
  const stex = new THREE.CanvasTexture(scv); stex.magFilter = THREE.LinearFilter; stex.minFilter = THREE.LinearFilter;
  const sgeo = new THREE.PlaneGeometry(MAP.W, MAP.H, 50, 35); sgeo.rotateX(-Math.PI / 2);
  { const p = sgeo.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 500, y = 350 - p.getZ(i); p.setY(i, height(x, y) + 0.7); } }
  const shroudMesh = new THREE.Mesh(sgeo, new THREE.MeshBasicMaterial({ map: stex, transparent: true, depthWrite: false }));
  shroudMesh.renderOrder = 1; shroudMesh.visible = false; scene.add(shroudMesh);
  let lastKey = '';
  const shroud = (explored: Uint8Array | null) => {
    if (!explored) { shroudMesh.visible = false; lastKey = ''; return; }
    shroudMesh.visible = true;
    let key = ''; for (let i = 0; i < explored.length; i += 8) key += explored[i] + explored[i + 1] * 2 + explored[i + 2] * 4 + explored[i + 3] * 8 + explored[i + 4] * 16 + explored[i + 5] * 32 + explored[i + 6] * 64 + explored[i + 7] * 128 + ',';
    if (key === lastKey) return; lastKey = key;
    sg.clearRect(0, 0, 40, 28);
    sg.fillStyle = 'rgba(16,20,12,0.62)';
    for (let cy = 0; cy < 28; cy++) for (let cx = 0; cx < 40; cx++) if (!explored[cy * 40 + cx]) sg.fillRect(cx, 27 - cy, 1, 1);
    stex.needsUpdate = true;
  };
  return { ground, setOwner, reveal, shroud };
}
