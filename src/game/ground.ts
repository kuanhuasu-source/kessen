// 地表合成貼圖：用 Gemini 生成的可平鋪紋理（草地、林地、稻田、土路）在 canvas 上合成整片戰場與外圍原野，
// 一張貼圖貼在一個平面上（手機只多一個 draw call）。模擬用的地形範圍不變：森林、稻田仍是 data.ts 的矩形。
import * as THREE from 'three';
import { MAP, STREAMS } from '../sim/data.ts';
import { height } from '../sim/sim.ts';
import { texture } from './art.ts';
import { rng } from './coords.ts';

export const GROUND = { x0: -300, x1: 1300, y0: -300, y1: 1000, pxPerM: 1.5 }; // 外圍各延伸 300 m（北犀川、東千曲川在延伸區）
// 河道（模擬座標）：北邊犀川由西往東，東邊千曲川由南往北；回傳到河中心線的距離（m）與河寬
export function riverAt(x: number, y: number): { d: number; w: number } {
  const sai = 790 + Math.sin(x / 170) * 28 + Math.sin(x / 61) * 9;      // 犀川中心 y
  const chikuma = 1110 + Math.sin(y / 150) * 30 + Math.cos(y / 47) * 8; // 千曲川中心 x
  const d1 = Math.abs(y - sai), d2 = Math.abs(x - chikuma);
  return d1 < d2 ? { d: d1, w: 46 } : { d: d2, w: 60 };
}
// 溪流中心線距離（m）
export function streamAt(x: number, y: number, key: string): { d: number; w: number } {
  let best = { d: 1e9, w: 0 };
  for (const st of STREAMS[key] ?? []) for (let i = 0; i < st.pts.length - 1; i++) {
    const [ax, ay] = st.pts[i], [bx, by] = st.pts[i + 1]; const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
    const k = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2)); const d = Math.hypot(ax + vx * k - x, ay + vy * k - y);
    if (d < best.d) best = { d, w: st.w };
  }
  return best;
}
export const groundH = (x: number, y: number, h: number, streams = 'none') => { // 河床下陷，岸邊緩坡（只影響畫面）
  const r = riverAt(x, y); const half = r.w / 2;
  if (r.d < half) return -2.6; if (r.d < half + 18) return -2.6 + (r.d - half) / 18 * (h + 2.6);
  const s = streamAt(x, y, streams); const sh = s.w / 2;
  if (s.d < sh) return h - 1.1; if (s.d < sh + 6) return h - 1.1 + (s.d - sh) / 6 * 1.1;
  return h;
};

const loadImg = (url: string | undefined) => new Promise<HTMLImageElement | null>(res => { if (!url) { res(null); return; } const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });

// 畫出合成貼圖；紋理載入失敗時用純色代替
export async function paintGround(streams = 'none'): Promise<HTMLCanvasElement> {
  const k = GROUND.pxPerM, W = Math.round((GROUND.x1 - GROUND.x0) * k), H = Math.round((GROUND.y1 - GROUND.y0) * k);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const X = (x: number) => (x - GROUND.x0) * k, Y = (y: number) => (GROUND.y1 - y) * k; // 北在上
  const R = rng(1561);
  const [grass, forest, paddy, dirt] = await Promise.all([texture('grass'), texture('forest'), texture('paddy'), texture('dirt')].map(loadImg));
  const pat = (im: HTMLImageElement | null, tileM: number, fallback: string, rot = 0) => {
    if (!im) return fallback;
    const p = g.createPattern(im, 'repeat')!; const s = tileM * k / im.width;
    const m = new DOMMatrix(); m.rotateSelf(rot); m.scaleSelf(s, s); p.setTransform(m); return p;
  };
  // ---- 草地底 ----
  g.fillStyle = pat(grass, 34, '#7f8f4e'); g.fillRect(0, 0, W, H);
  // 低頻色調變化：大片半透明的黃、深綠斑
  for (let i = 0; i < 90; i++) {
    const x = GROUND.x0 + R() * 1600, y = GROUND.y0 + R() * 1300, r = 60 + R() * 140;
    const grd = g.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * k);
    const col = R() < 0.5 ? '160,150,70' : '60,90,40';
    grd.addColorStop(0, `rgba(${col},${0.10 + R() * 0.12})`); grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd; g.fillRect(X(x) - r * k, Y(y) - r * k, 2 * r * k, 2 * r * k);
  }
  // 高地：依實際高度上色（越高越黃褐、稜線陰影），並畫 4 m 一條的等高線
  { const step = 4; const base = height(500, 50);
    for (let y = GROUND.y0; y < GROUND.y1; y += step) for (let x = GROUND.x0; x < GROUND.x1; x += step) {
      const h = height(x, y) - base; if (h < 2.5) continue;
      const a = Math.min(0.5, (h - 2.5) / 18 * 0.5);
      const slope = height(x + 6, y) - h - base; // 東面受光、西面陰影
      g.fillStyle = `rgba(${slope < -0.6 ? '200,190,120' : slope > 0.6 ? '110,105,60' : '175,165,95'},${a})`;
      g.fillRect(X(x), Y(y + step), step * k + 0.5, step * k + 0.5);
    }
    g.fillStyle = 'rgba(80,70,40,0.35)';
    for (let y = GROUND.y0; y < GROUND.y1; y += 2) for (let x = GROUND.x0; x < GROUND.x1; x += 2) {
      const h = height(x, y) - base; if (h < 3) continue;
      const lv = Math.floor(h / 4);
      if (Math.floor((height(x + 2, y) - base) / 4) !== lv || Math.floor((height(x, y + 2) - base) / 4) !== lv) g.fillRect(X(x), Y(y + 2), 2 * k, 2 * k);
    }
  }
  // ---- 森林地面（不規則邊緣） ----
  { const f = MAP.forest; const wob = (t: number, seed: number) => Math.sin(t * 0.9 + seed) * 7 + Math.sin(t * 2.3 + seed * 2) * 4;
    g.save(); g.beginPath();
    const steps = 48;
    for (let i = 0; i <= steps; i++) { const y = f.y0 + (f.y1 - f.y0) * i / steps; const x = f.x1 + wob(y / 10, 1); i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); }
    for (let i = steps; i >= 0; i--) { const x = f.x0 + (f.x1 - f.x0) * i / steps; const y = f.y1 + wob(x / 10, 3) * 0.6; g.lineTo(X(Math.max(GROUND.x0, x)), Y(y)); }
    for (let i = 0; i <= steps; i++) { const x = f.x0 + (f.x1 - f.x0) * i / steps; const y = f.y0 - wob(x / 10, 5) * 0.6; g.lineTo(X(Math.max(GROUND.x0, x)), Y(y)); }
    g.closePath(); g.clip();
    g.fillStyle = pat(forest, 28, '#4d5a30'); g.fillRect(X(GROUND.x0), Y(f.y1 + 20), (f.x1 + 20 - GROUND.x0) * k, (f.y1 - f.y0 + 40) * k);
    g.fillStyle = 'rgba(30,45,25,0.35)'; g.fillRect(X(GROUND.x0), Y(f.y1 + 20), (f.x1 + 20 - GROUND.x0) * k, (f.y1 - f.y0 + 40) * k); // 林下偏暗
    g.restore();
  }
  // ---- 稻田：矩形內分成大小不一、略為歪斜的田塊，田埂是土色 ----
  { const p = MAP.paddy;
    g.save(); g.beginPath(); g.rect(X(p.x0), Y(p.y1), (p.x1 - p.x0) * k, (p.y1 - p.y0) * k); g.clip();
    g.fillStyle = '#8a7a52'; g.fillRect(X(p.x0), Y(p.y1), (p.x1 - p.x0) * k, (p.y1 - p.y0) * k); // 田埂底色
    const cols = 5, rows = 7; const xs: number[] = [p.x0], ys: number[] = [p.y0];
    for (let i = 1; i < cols; i++) xs.push(p.x0 + (p.x1 - p.x0) * i / cols + (R() - 0.5) * 14); xs.push(p.x1);
    for (let j = 1; j < rows; j++) ys.push(p.y0 + (p.y1 - p.y0) * j / rows + (R() - 0.5) * 10); ys.push(p.y1);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x0 = xs[i] + 1.6, x1 = xs[i + 1] - 1.6, y0 = ys[j] + 1.6, y1 = ys[j + 1] - 1.6;
      const sk = (R() - 0.5) * 3;
      g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1 + sk), Y(y0)); g.lineTo(X(x1), Y(y1)); g.lineTo(X(x0 - sk), Y(y1)); g.closePath();
      g.fillStyle = pat(paddy, 22, '#6f8f80'); g.fill();
      // 水面反光與秧苗色差
      g.fillStyle = `rgba(${R() < 0.5 ? '120,170,150' : '150,190,110'},${0.18 + R() * 0.22})`; g.fill();
      g.fillStyle = 'rgba(200,225,230,0.10)'; g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(110,95,60,0.9)'; g.lineWidth = 2.5 * k; g.strokeRect(X(p.x0), Y(p.y1), (p.x1 - p.x0) * k, (p.y1 - p.y0) * k); // 外圍田埂
  }
  // ---- 土路：兩軍本陣到寺廟、村落與補給點到寺廟 ----
  const road = (pts: [number, number][], w: number, alpha = 1) => {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    const path = () => { g.beginPath(); g.moveTo(X(pts[0][0]), Y(pts[0][1])); for (let i = 1; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; g.quadraticCurveTo(X(ax), Y(ay), X((ax + bx) / 2), Y((ay + by) / 2)); } const [lx, ly] = pts[pts.length - 1]; g.lineTo(X(lx), Y(ly)); };
    path(); g.strokeStyle = `rgba(70,60,40,${0.35 * alpha})`; g.lineWidth = (w + 2.5) * k; g.stroke(); // 路肩
    path(); g.strokeStyle = pat(dirt, 18, '#9b8a5e', 90); g.globalAlpha = alpha; g.lineWidth = w * k; g.stroke(); g.globalAlpha = 1;
    path(); g.strokeStyle = 'rgba(120,105,70,0.25)'; g.lineWidth = w * 0.35 * k; g.stroke();
    g.restore();
  };
  road([[500, -300], [470, -120], [515, 60], [485, 200], [500, 300]], 7);        // 武田本陣 → 寺廟
  road([[500, 400], [520, 520], [480, 640], [505, 760], [500, 1000]], 7);       // 寺廟 → 上杉本陣（過犀川的渡口）
  road([[320, 350], [380, 330], [440, 345], [480, 350]], 5.5);                   // 村落 → 寺廟
  road([[520, 350], [600, 340], [690, 360], [840, 350], [890, 350]], 5.5);       // 寺廟 → 補給點
  road([[320, 350], [250, 300], [120, 230], [-100, 160]], 4.5, 0.8);             // 村落往西的鄉道
  road([[890, 350], [960, 380], [1060, 420]], 4.5, 0.8);                         // 補給點往東到河邊
  // 村落周邊的菜園與踩踏地
  { const v = MAP.points[0]; g.fillStyle = 'rgba(120,100,65,0.35)'; g.beginPath(); g.ellipse(X(v.x), Y(v.y), 30 * k, 24 * k, 0.3, 0, 6.28); g.fill();
    g.strokeStyle = 'rgba(95,80,45,0.5)'; g.lineWidth = 1.2 * k;
    for (const [dx, dy, w, h] of [[-48, 20, 26, 14], [34, -26, 22, 12], [-30, -34, 20, 12]] as const) {
      g.fillStyle = 'rgba(130,110,60,0.45)'; g.fillRect(X(v.x + dx), Y(v.y + dy), w * k, h * k);
      for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(X(v.x + dx), Y(v.y + dy) + h * k * i / 6); g.lineTo(X(v.x + dx) + w * k, Y(v.y + dy) + h * k * i / 6); g.stroke(); }
    }
  }
  // ---- 河：岸灘、水面、水紋 ----
  const water = (sample: (t: number) => [number, number], w: number) => {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    const path = () => { g.beginPath(); for (let i = 0; i <= 80; i++) { const [x, y] = sample(i / 80); i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); } };
    path(); g.strokeStyle = '#b9ad88'; g.lineWidth = (w + 30) * k; g.stroke();   // 河灘
    path(); g.strokeStyle = '#8f8463'; g.lineWidth = (w + 12) * k; g.stroke();   // 濕砂
    path(); g.strokeStyle = '#5f7f93'; g.lineWidth = w * k; g.stroke();          // 水
    path(); g.strokeStyle = 'rgba(150,185,200,0.45)'; g.lineWidth = w * 0.55 * k; g.stroke();
    g.setLineDash([14 * k, 22 * k]); path(); g.strokeStyle = 'rgba(220,235,240,0.35)'; g.lineWidth = 1.2 * k; g.stroke();
    g.restore();
  };
  water(t => { const x = GROUND.x0 + t * 1600; return [x, 790 + Math.sin(x / 170) * 28 + Math.sin(x / 61) * 9]; }, 46);
  water(t => { const y = GROUND.y0 + t * 1300; return [1110 + Math.sin(y / 150) * 30 + Math.cos(y / 47) * 8, y]; }, 60);
  // ---- 溪流與渡口 ----
  for (const st of STREAMS[streams] ?? []) {
    const path = () => { g.beginPath(); st.pts.forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); };
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    path(); g.strokeStyle = '#a89a76'; g.lineWidth = (st.w + 10) * k; g.stroke();      // 河灘
    path(); g.strokeStyle = '#5c7d90'; g.lineWidth = st.w * k; g.stroke();             // 水
    path(); g.strokeStyle = 'rgba(160,195,210,0.5)'; g.lineWidth = st.w * 0.5 * k; g.stroke();
    g.setLineDash([8 * k, 14 * k]); path(); g.strokeStyle = 'rgba(225,240,245,0.4)'; g.lineWidth = 1 * k; g.stroke(); g.setLineDash([]);
    for (const f of st.fords) { // 渡口：淺灘與踏石
      g.fillStyle = 'rgba(190,180,150,0.75)'; g.beginPath(); g.ellipse(X(f.x), Y(f.y), f.r * k, st.w * 0.6 * k, 0, 0, 6.28); g.fill();
      g.fillStyle = '#9a9388';
      for (let i = 0; i < 7; i++) { const a = R() * 6.28, d = R() * f.r * 0.7; g.beginPath(); g.ellipse(X(f.x + Math.cos(a) * d), Y(f.y + Math.sin(a) * d * 0.5), 1.4 * k, 1 * k, a, 0, 6.28); g.fill(); }
    }
    g.restore();
  }
  // ---- 戰場邊界：淡淡一圈，提醒可用範圍 ----
  g.strokeStyle = 'rgba(40,36,24,0.22)'; g.lineWidth = 1.5; g.setLineDash([8, 10]); g.strokeRect(X(0), Y(700), 1000 * k, 700 * k); g.setLineDash([]);
  return cv;
}

export function groundTexture(cv: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
