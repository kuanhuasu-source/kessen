// 繪卷風 2D 戰場（2026-11 回顧後的 B 方案）：紙底、金雲、千曲川、松林、題箋；部隊是陣形色塊＋幟旗（旗上家紋與兵種字，旗的姿態表示士氣）。
// 只負責畫：模擬狀態、選取、情報等級都由 main.ts 傳進來。靜態地圖先烤成一張離屏畫布，每幀只貼圖再畫部隊與特效。
import { MAP, STREAMS } from '../sim/data.ts';
import type { State, Unit, Ninja } from '../sim/sim.ts';
import { rng } from './coords.ts';

const RES = 2;                                   // 靜態地圖每公尺幾個像素
const WX0 = -220, WX1 = 1220, WY0 = -140, WY1 = 840; // 靜態地圖涵蓋的範圍（模擬座標）
const INK = '#2a1d14', PAPER = '#e9dcbd';
const FONT = '"LXGW WenKai TC", "Noto Serif TC", serif';
const COL = [{ fill: '#b5392b', dark: '#7d2219', man: '#f3d2bf', name: '#6d1d14' }, { fill: '#2f4a7a', dark: '#1d2f52', man: '#cfdaf0', name: '#1d2f52' }];
import { KANJI as KAN } from './names.ts';
const ROADS: [number, number][][] = [
  [[560, -300], [530, -100], [520, 60], [505, 200], [500, 300], [470, 470], [440, 640], [420, 1000]],
  [[330, 345], [420, 320], [500, 300]], [[500, 300], [600, 320], [700, 335], [880, 300], [1000, 280], [1090, 260]],
  [[330, 345], [290, 440], [260, 520], [230, 600], [180, 720]], [[-300, 300], [-100, 330], [130, 340], [330, 345]], [[700, 335], [760, 400], [800, 520], [850, 640], [900, 760]],
];
const SPECK = [0.035, 0.05, 0.065, 0.08].flatMap(a => [`rgba(90,70,40,${a})`, `rgba(255,250,230,${a})`]);
const HILL_NAME: Record<string, string> = { '210,650': '妻女山', '890,670': '茶臼山', '500,210': '八幡原' };

export type Draw2D = {
  dt: number; t: number;
  lvl: (u: Unit) => number;                              // 0 未知、1 察覺、2 識別、3 洞悉（我方一律 3）
  pos: (u: Unit) => { x: number; y: number };            // 內插後的位置
  ghost: (u: Unit) => { x: number; y: number } | null;   // 察覺中的敵軍的大概位置
  selected: Set<number>; manual: Set<number>;
  showNinja: (n: Ninja) => boolean; selNin: number; ninRange: boolean;
  explored: Uint8Array | null; fog: number;              // fog：視野倍率（1＝沒有霧）
  target: Unit | null; info: Unit | null;
  preview: { x: number; y: number; f: number; w: number; d: number }[] | null;
  lead: number;      // 視角模式帶隊的部隊（-1＝俯瞰）
  title: boolean;    // 右上角題箋（右側按鈕變多時收起）
};
type Fx = { k: 'arrow' | 'puff' | 'ring' | 'star' | 'mark'; x: number; y: number; x1?: number; y1?: number; t: number; dur: number; r?: number; c?: string; delay?: number };

export class View2D {
  private g: CanvasRenderingContext2D;
  private stat = document.createElement('canvas');   // 靜態地圖
  private deco = document.createElement('canvas');   // 螢幕座標的金雲與題箋
  private mist = document.createElement('canvas');   // 未探索的霞（40×28 格）
  private W = 0; private H = 0; private dpr = 1;
  cx = 500; cy = 300; k = 1.2;
  private fx: Fx[] = []; private marks: { x: number; y: number; s: number }[] = [];
  private lastMen = new Map<number, number>();
  private flashM: { x: number; y: number; t: number; attack: boolean; r: number } | null = null;
  private clock = 0; private r = rng(20261112);
  private specks: { x: number; y: number; w: number; s: number }[] = [];
  private detail = document.createElement('canvas'); private dRect: { x0: number; y0: number; x1: number; y1: number; res: number } | null = null; private dBakeAt = 0;

  constructor(private S: State, public canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!; canvas.style.background = PAPER;
    this.mist.width = 40; this.mist.height = 28;
    { const r = rng(31); for (let i = 0; i < 60000; i++) this.specks.push({ x: WX0 + r() * (WX1 - WX0), y: WY0 + r() * (WY1 - WY0), w: 1 + r() * 2, s: Math.floor(r() * 8) }); this.specks.sort((a, b) => a.s - b.s); }
    this.bake(); this.resize();
    // 字型晚到的話重烤一次（題箋與地名用得到）
    if (document.fonts?.load) void document.fonts.load(`700 12px ${FONT}`, '川中島合戰圖妻女山').then(() => { this.bake(); this.bakeDeco(); }).catch(() => undefined);
  }
  resize() {
    this.W = window.innerWidth; this.H = window.innerHeight; this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * this.dpr); this.canvas.height = Math.round(this.H * this.dpr);
    this.bakeDeco();
  }
  setCam(cx: number, cy: number, dist: number) { this.cx = cx; this.cy = cy; this.k = this.H / (dist * 1.16); }
  X(x: number) { return (x - this.cx) * this.k + this.W / 2; }
  Y(y: number) { return this.H / 2 - (y - this.cy) * this.k; }
  toSim(sx: number, sy: number) { return { x: this.cx + (sx - this.W / 2) / this.k, y: this.cy - (sy - this.H / 2) / this.k }; }
  flash(x: number, y: number, attack: boolean, r: number) { this.flashM = { x, y, t: 0, attack, r }; }

  // ---------------- 靜態地圖 ----------------
  private bake() { this.bakeInto(this.stat, WX0, WY0, WX1, WY1, RES); this.dRect = null; }
  // 把地圖的一塊（模擬座標 rx0..rx1 × ry0..ry1）以每公尺 res 像素畫進畫布。繪製座標一律用「每公尺 2 像素」的尺寸，靠畫布縮放換成 res，
  // 所以整張底圖與拉近用的局部高解析圖是同一段程式、同一組亂數，內容完全一致。
  private bakeInto(c: HTMLCanvasElement, rx0: number, ry0: number, rx1: number, ry1: number, res: number) {
    c.width = Math.round((rx1 - rx0) * res); c.height = Math.round((ry1 - ry0) * res);
    const g = c.getContext('2d')!; const r = rng(7); g.setTransform(res / 2, 0, 0, res / 2, 0, 0);
    const X = (x: number) => (x - rx0) * 2, Y = (y: number) => (ry1 - y) * 2, K = 2, CW = (rx1 - rx0) * 2, CH = (ry1 - ry0) * 2;
    g.fillStyle = PAPER; g.fillRect(0, 0, CW, CH);
    { const gr = g.createRadialGradient(X(500), Y(350), 100, X(500), Y(350), 1500); gr.addColorStop(0, 'rgba(196,205,150,0.55)'); gr.addColorStop(1, 'rgba(176,170,120,0.3)'); g.fillStyle = gr; g.fillRect(0, 0, CW, CH); }
    for (let i = 0; i < 140; i++) { const x = X(WX0 + r() * (WX1 - WX0)), y = Y(WY0 + r() * (WY1 - WY0)), rr = 60 + r() * 220; if (x + rr < 0 || x - rr > CW || y + rr < 0 || y - rr > CH) { r(); continue; } const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(${r() < 0.5 ? '150,165,105' : '205,190,140'},0.16)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr); }
    // 紙的顆粒：開機時算好一次（八種深淺），每次烘焙只畫落在範圍內的
    { let cur = -1; for (const sp of this.specks) { const x = X(sp.x), y = Y(sp.y); if (x < -3 || x > CW || y < -1 || y > CH) continue; if (sp.s !== cur) { cur = sp.s; g.fillStyle = SPECK[cur]; } g.fillRect(x, y, sp.w, 1); } }
    // 高地：暈染＋等高筆觸＋地名
    for (const h of MAP.hills) {
      const x = X(h.x), y = Y(h.y), rr = h.r * K; const a = Math.min(0.6, 0.18 + h.h / 70);
      const gr = g.createRadialGradient(x, y, rr * 0.1, x, y, rr); gr.addColorStop(0, `rgba(104,124,80,${a})`); gr.addColorStop(1, 'rgba(104,124,80,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
      g.strokeStyle = `rgba(42,29,20,${h.h > 10 ? 0.22 : 0.12})`; g.lineWidth = 1.4; for (let q = 0.3; q < 0.95; q += h.h > 10 ? 0.14 : 0.22) { g.beginPath(); g.ellipse(x, y, rr * q, rr * q * 0.82, 0.2, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); }
      const nm = HILL_NAME[`${h.x},${h.y}`]; if (nm) { g.font = `700 ${h.h > 10 ? 26 : 20}px ${FONT}`; g.textAlign = 'center'; g.fillStyle = 'rgba(42,29,20,0.5)'; [...nm].forEach((ch, i) => g.fillText(ch, x - rr * 0.35, y - rr * 0.25 + i * 28)); }
    }
    // 田
    for (const p of MAP.paddies) {
      const x0 = X(p.x0), x1 = X(p.x1), y0 = Y(p.y1), y1 = Y(p.y0); g.fillStyle = 'rgba(150,172,120,0.5)'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = 'rgba(200,220,235,0.35)'; const st = 20 * K; for (let i = 0; i < 16; i++) g.fillRect(x0 + Math.floor(r() * ((x1 - x0) / st - 1)) * st + 2, y0 + Math.floor(r() * ((y1 - y0) / (st * 0.8) - 1)) * st * 0.8 + 2, st - 4, st * 0.8 - 4);
      g.strokeStyle = 'rgba(70,90,60,0.5)'; g.lineWidth = 1.2;
      for (let x = x0; x <= x1 + 0.5; x += st) { g.beginPath(); g.moveTo(x + (r() - 0.5) * 2, y0); g.lineTo(x + (r() - 0.5) * 2, y1); g.stroke(); }
      for (let y = y0; y <= y1 + 0.5; y += st * 0.8) { g.beginPath(); g.moveTo(x0, y + (r() - 0.5) * 2); g.lineTo(x1, y + (r() - 0.5) * 2); g.stroke(); }
    }
    // 街道
    g.lineJoin = g.lineCap = 'round';
    for (const rd of ROADS) { const path = () => { g.beginPath(); rd.forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); }; path(); g.strokeStyle = 'rgba(150,115,70,0.55)'; g.lineWidth = 7.5; g.stroke(); path(); g.strokeStyle = 'rgba(222,200,150,0.85)'; g.lineWidth = 4; g.stroke(); }
    // 千曲川與渡口
    for (const st of STREAMS[this.S.R.streams] ?? []) {
      const pts = st.pts, w = st.w * K; const path = () => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); };
      path(); g.strokeStyle = 'rgba(214,196,150,0.95)'; g.lineWidth = w * 2.3; g.stroke();
      path(); g.strokeStyle = '#3f5f8c'; g.lineWidth = w * 1.55; g.stroke(); path(); g.strokeStyle = '#557aa6'; g.lineWidth = w * 1.05; g.stroke(); path(); g.strokeStyle = 'rgba(120,160,200,0.6)'; g.lineWidth = w * 0.45; g.stroke();
      g.strokeStyle = 'rgba(240,246,250,0.75)'; g.lineWidth = 1.6;
      for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], L = Math.hypot(bx - ax, by - ay), n = Math.floor(L / 13); const ang = Math.atan2(-(by - ay), bx - ax);
        for (let j = 0; j < n; j++) { const t = (j + r()) / n, off = (r() - 0.5) * st.w * 1.1; const nx = -(by - ay) / L, ny = (bx - ax) / L; g.beginPath(); g.ellipse(X(ax + (bx - ax) * t + nx * off), Y(ay + (by - ay) * t + ny * off), 8, 2.8, ang, Math.PI, Math.PI * 2); g.stroke(); } }
      for (const f of st.fords) { const x = X(f.x), y = Y(f.y); g.fillStyle = 'rgba(226,212,170,0.94)'; g.beginPath(); g.ellipse(x, y, f.r * K * 1.25, f.r * K * 0.8, -0.35, 0, 7); g.fill(); g.fillStyle = 'rgba(120,105,80,0.6)'; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(x + (i - 3) * 6, y + Math.sin(i) * 2.5 + (i - 3) * 2, 2, 0, 7); g.fill(); }
        const nm = (f as { name?: string }).name; if (nm) { g.font = `700 18px ${FONT}`; g.fillStyle = 'rgba(42,29,20,0.7)'; g.textAlign = 'center'; g.fillText(nm, x, y - f.r * K - 8); } }
    }
    // 松林
    const pine = (x: number, y: number, s: number) => { g.fillStyle = '#5b4630'; g.fillRect(x - 1.1 * s, y, 2.2 * s, 7 * s); for (let i = 0; i < 3; i++) { g.fillStyle = ['#2f4d37', '#3a5d40', '#4a6f4a'][i]; g.beginPath(); g.ellipse(x + (i - 1) * 2.2 * s, y - i * 4.6 * s, (9.4 - i * 2) * s, (4.6 - i * 0.7) * s, 0, 0, 7); g.fill(); } g.strokeStyle = 'rgba(42,29,20,0.35)'; g.lineWidth = 0.9; g.beginPath(); g.ellipse(x - 2.2 * s, y, 9.4 * s, 4.6 * s, 0, 0, 7); g.stroke(); };
    { const trees: [number, number][] = []; for (const f of MAP.forests) for (let x = f.x0; x < f.x1; x += 15) for (let y = f.y0; y < f.y1; y += 12) trees.push([x + r() * 10, y + r() * 8]); trees.sort((a, b) => b[1] - a[1]); for (const [x, y] of trees) pine(X(x), Y(y), 0.9 + r() * 0.5); }
    // 據點的建物與題牌（歸屬圈每幀另外畫）
    for (const p of MAP.points) {
      const x = X(p.x), y = Y(p.y);
      if (p.id === 'temple') { g.strokeStyle = '#a3301f'; g.lineWidth = 3.6; g.beginPath(); g.moveTo(x - 13, y + 11); g.lineTo(x - 13, y - 11); g.moveTo(x + 13, y + 11); g.lineTo(x + 13, y - 11); g.moveTo(x - 18, y - 11); g.lineTo(x + 18, y - 11); g.moveTo(x - 15, y - 4); g.lineTo(x + 15, y - 4); g.stroke(); g.lineWidth = 4.6; g.beginPath(); g.moveTo(x - 20, y - 15); g.quadraticCurveTo(x, y - 11, x + 20, y - 15); g.stroke(); }
      else { const n = p.id === 'village' ? 5 : 2; for (let i = 0; i < n; i++) { const hx = x + (i - (n - 1) / 2) * 16 + (i % 2) * 4, hy = y + (i % 2 ? -9 : 7); g.fillStyle = p.id === 'village' ? '#c9b890' : '#e4dcc4'; g.fillRect(hx - 6.5, hy - 2, 13, 8.5); g.fillStyle = p.id === 'village' ? '#7a5a38' : '#3d3a36'; g.beginPath(); g.moveTo(hx - 9, hy - 2); g.lineTo(hx, hy - 10); g.lineTo(hx + 9, hy - 2); g.fill(); g.strokeStyle = 'rgba(42,29,20,0.6)'; g.lineWidth = 0.9; g.strokeRect(hx - 6.5, hy - 2, 13, 8.5); } }
      const nm = MAP.names[p.id as keyof typeof MAP.names] ?? p.id, sub = p.id === 'temple' ? '士氣' : p.id === 'village' ? '援軍' : '箭矢';
      const bx = x + 26, by = y - 40, bh = nm.length * 20 + 14; g.fillStyle = 'rgba(244,234,208,0.96)'; g.strokeStyle = '#7a6a50'; g.lineWidth = 2.4; g.fillRect(bx, by, 25, bh); g.strokeRect(bx, by, 25, bh);
      g.fillStyle = INK; g.font = `700 19px ${FONT}`; g.textAlign = 'center'; [...nm].forEach((ch, i) => g.fillText(ch, bx + 12.5, by + 23 + i * 20)); g.font = `16px ${FONT}`; g.fillStyle = 'rgba(42,29,20,0.7)'; g.textAlign = 'left'; g.fillText(sub, bx + 31, by + 18);
    }
  }
  // 金雲（屏風繪的雲帶：上下收邊，讓介面有底）與題箋
  private bakeDeco() {
    const c = this.deco, W = this.W, H = this.H; c.width = Math.round(W * this.dpr); c.height = Math.round(H * this.dpr);
    const g = c.getContext('2d')!; g.scale(this.dpr, this.dpr); const r = rng(99);
    const cloud = (yEdge: number, dir: number) => {
      g.save(); const gr = g.createLinearGradient(0, yEdge - dir * 46, 0, yEdge + dir * 10); gr.addColorStop(0, '#d9b962'); gr.addColorStop(1, '#ecd795'); g.fillStyle = gr; g.strokeStyle = 'rgba(140,105,40,0.75)'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(-10, yEdge - dir * 70); g.lineTo(-10, yEdge); let x = -10; while (x < W + 30) { const rr = 16 + r() * 20, dy = (r() - 0.3) * 12; g.arc(x + rr, yEdge + dir * dy * 0.5, rr, Math.PI, 0, dir < 0); x += rr * 2 - 5; } g.lineTo(W + 30, yEdge - dir * 70); g.closePath();
      g.shadowColor = 'rgba(60,40,10,0.35)'; g.shadowBlur = 6; g.shadowOffsetY = dir * 2; g.fill(); g.shadowColor = 'transparent'; g.stroke();
      g.globalAlpha = 0.25; for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? '#fff3c4' : '#b08a3a'; g.fillRect(r() * W, yEdge - dir * (r() * 44), 1.5, 1.5); } g.restore();
    };
    cloud(30, 1); cloud(H - 44, -1);
  }

  private title() { const g = this.g, W = this.W;
    const x = W - 34, y = 40; g.fillStyle = '#a3301f'; g.fillRect(x, y, 15, 66); g.strokeStyle = '#e3c15a'; g.lineWidth = 1; g.strokeRect(x + 1.5, y + 1.5, 12, 63); g.fillStyle = '#fbf4e2'; g.font = `700 9.5px ${FONT}`; g.textAlign = 'center'; [...'川中島合戰圖'].forEach((ch, i) => g.fillText(ch, x + 7.5, y + 12 + i * 10.2));
  }

  // ---------------- 戰鬥事件 → 特效 ----------------
  event(e: { k: string; n?: number; s?: string }, A: Unit | undefined, T: Unit | null, seen: boolean) {
    if (!A || !seen) return;
    const add = (f: Fx) => { if (this.fx.length < 260) this.fx.push(f); };
    if (e.k === 'volley' && T) {
      if (e.s === 'gun' || e.s === 'cannon') { const big = e.s === 'cannon'; for (let i = 0; i < (big ? 5 : 7); i++) add({ k: 'puff', x: A.x + (Math.random() - 0.5) * A.width, y: A.y + (Math.random() - 0.5) * 4, t: 0, dur: big ? 2.2 : 1.4, r: big ? 9 : 4.5, delay: Math.random() * 0.25 }); add({ k: 'star', x: T.x, y: T.y, t: 0, dur: 0.5, r: big ? 12 : 6, delay: big ? 0.5 : 0.15 }); }
      else { const n = Math.min(14, 4 + Math.ceil(A.men / 6)); for (let i = 0; i < n; i++) add({ k: 'arrow', x: A.x + (Math.random() - 0.5) * A.width, y: A.y + (Math.random() - 0.5) * 4, x1: T.x + (Math.random() - 0.5) * T.width, y1: T.y + (Math.random() - 0.5) * T.depth, t: 0, dur: 0.75, delay: Math.random() * 0.35 }); }
    } else if (e.k === 'charge' && T) { for (let i = 0; i < (e.n ? 9 : 4); i++) add({ k: 'puff', x: T.x + (Math.random() - 0.5) * 16, y: T.y + (Math.random() - 0.5) * 12, t: 0, dur: 1.1, r: 5, c: '196,170,120', delay: Math.random() * 0.2 }); add({ k: 'star', x: (A.x + T.x) / 2, y: (A.y + T.y) / 2, t: 0, dur: 0.45, r: e.n ? 11 : 7 }); }
    else if (e.k === 'cry') add({ k: 'ring', x: A.x, y: A.y, t: 0, dur: 0.9, r: this.S.R.cryR, c: A.side === 0 ? '181,57,43' : '47,74,122' });
    else if (e.k === 'skill' && (e.s === 'kuruma' || e.s === 'furin')) add({ k: 'ring', x: A.x, y: A.y, t: 0, dur: 1.6, r: 100, c: '201,162,39' });
    else if (e.k === 'rout' || e.k === 'shatter') add({ k: 'ring', x: A.x, y: A.y, t: 0, dur: 1.2, r: this.S.R.friendlyRoutR, c: '160,40,30' });
    else if (e.k === 'cmd') add({ k: 'star', x: A.x, y: A.y, t: 0, dur: 0.9, r: 14 });
  }

  // ---------------- 每幀 ----------------
  draw(o: Draw2D) {
    const g = this.g, S = this.S, k = this.k, W = this.W, H = this.H; this.clock += o.dt;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#d8c9a4'; g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.stat, this.X(WX0), this.Y(WY1), (WX1 - WX0) * k, (WY1 - WY0) * k);
    // 拉近時底圖會糊：另外烤一張只涵蓋鏡頭附近的高解析局部圖蓋上去（移出範圍或縮放差太多才重烤，最快每 0.22 秒一次）
    const need = k * this.dpr;
    if (need > RES * 1.3) {
      const hw = W / 2 / k, hh = H / 2 / k, d = this.dRect;
      const ok = d && this.cx - hw >= d.x0 && this.cx + hw <= d.x1 && this.cy - hh >= d.y0 && this.cy + hh <= d.y1 && d.res >= need * 0.8 && d.res <= need * 1.8;
      if (!ok && performance.now() - this.dBakeAt > 220) {
        const mx = hw * 0.7, my = hh * 0.7, x0 = Math.max(WX0, this.cx - hw - mx), x1 = Math.min(WX1, this.cx + hw + mx), y0 = Math.max(WY0, this.cy - hh - my), y1 = Math.min(WY1, this.cy + hh + my);
        const res = Math.min(need, 8, Math.sqrt(5e6 / Math.max(1, (x1 - x0) * (y1 - y0))));
        this.bakeInto(this.detail, x0, y0, x1, y1, res); this.dRect = { x0, y0, x1, y1, res }; this.dBakeAt = performance.now();
      }
      const q = this.dRect; if (q && q.res > RES * 1.1) g.drawImage(this.detail, this.X(q.x0), this.Y(q.y1), (q.x1 - q.x0) * k, (q.y1 - q.y0) * k);
    } else if (this.dRect && need < RES) { this.dRect = null; this.detail.width = this.detail.height = 1; }
    // 未探索的地方罩一層霞
    if (o.explored) {
      const m = this.mist.getContext('2d')!; const im = m.createImageData(40, 28);
      for (let cy = 0; cy < 28; cy++) for (let cx = 0; cx < 40; cx++) { const i = ((27 - cy) * 40 + cx) * 4; im.data[i] = 196; im.data[i + 1] = 184; im.data[i + 2] = 152; im.data[i + 3] = o.explored[cy * 40 + cx] ? 0 : 115; }
      m.putImageData(im, 0, 0); g.drawImage(this.mist, this.X(0), this.Y(700), 1000 * k, 700 * k);
    }
    // 據點歸屬、佔領進度、失火
    for (const p of S.points) {
      const x = this.X(p.x), y = this.Y(p.y), rr = MAP.pointR * k;
      g.strokeStyle = p.owner === 0 ? 'rgba(181,57,43,0.75)' : p.owner === 1 ? 'rgba(47,74,122,0.75)' : 'rgba(90,70,40,0.4)'; g.lineWidth = p.owner >= 0 ? 1.6 : 1; g.setLineDash([4, 3]); g.beginPath(); g.arc(x, y, rr, 0, 7); g.stroke(); g.setLineDash([]);
      if (p.prog > 0 && p.progSide >= 0 && p.progSide !== p.owner) { g.strokeStyle = COL[p.progSide].fill; g.lineWidth = 3; g.beginPath(); g.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.prog / 20)); g.stroke(); }
      if (p.burnedUntil > S.t) for (let i = 0; i < 4; i++) { const a = this.clock * 0.7 + i * 1.7; g.fillStyle = `rgba(60,50,45,${0.28 - i * 0.05})`; g.beginPath(); g.arc(x + Math.sin(a) * 6 + i * 3, y - 6 - i * 7 - (this.clock * 6 % 7), 6 + i * 2.5, 0, 7); g.fill(); }
    }
    // 忍術範圍：物見、霧隱、選忍術時的射程
    for (const m of S.monomi) if (m.side === 0 && m.until > S.t) { g.strokeStyle = 'rgba(201,162,39,0.7)'; g.fillStyle = 'rgba(201,162,39,0.08)'; g.lineWidth = 1.2; g.beginPath(); g.arc(this.X(m.x), this.Y(m.y), 150 * k, 0, 7); g.fill(); g.stroke(); }
    for (const sm of S.smokes) if (sm.until > S.t) for (let i = 0; i < 7; i++) { const a = i * 0.9 + this.clock * 0.15; g.fillStyle = 'rgba(120,118,125,0.22)'; g.beginPath(); g.arc(this.X(sm.x + Math.cos(a) * 28), this.Y(sm.y + Math.sin(a * 1.3) * 24), (26 + (i % 3) * 8) * k, 0, 7); g.fill(); }
    // 倒下的士兵留下的墨點
    g.fillStyle = 'rgba(42,29,20,0.34)'; for (const m of this.marks) { const x = this.X(m.x), y = this.Y(m.y); if (x < -5 || x > W + 5 || y < -5 || y > H + 5) continue; g.fillRect(x - m.s, y - 0.6, m.s * 2, 1.2); }
    // 朝霧（蓋住地圖，不蓋部隊）
    if (o.fog < 0.99) { const a = (1 - o.fog) * 0.5; for (let i = 0; i < 6; i++) { const x = ((i * 211 + this.clock * 7) % (W + 300)) - 150, y = H * (0.2 + 0.13 * i); const gr = g.createRadialGradient(x, y, 10, x, y, 260); gr.addColorStop(0, `rgba(246,242,232,${a})`); gr.addColorStop(1, 'rgba(246,242,232,0)'); g.fillStyle = gr; g.fillRect(x - 260, y - 260, 520, 520); } g.fillStyle = `rgba(240,236,226,${a * 0.25})`; g.fillRect(0, 0, W, H); }
    // 下令預覽、目標線
    if (o.preview) { g.strokeStyle = 'rgba(42,29,20,0.75)'; g.lineWidth = 1.2; g.setLineDash([4, 3]); for (const t of o.preview) { g.save(); g.translate(this.X(t.x), this.Y(t.y)); g.rotate(-t.f + Math.PI / 2); g.strokeRect(-t.w * k, -t.d * k, t.w * 2 * k, t.d * 2 * k); g.beginPath(); g.moveTo(0, -t.d * k); g.lineTo(0, -(t.d + 8) * k); g.stroke(); g.restore(); } g.setLineDash([]); }
    const us = S.units.filter(u => u.state !== 'gone' && !u.away);
    for (const u of us) if (o.selected.has(u.id) && u.target >= 0) { const T = S.units[u.target]; if (T.state === 'gone') continue; const a = o.pos(u), b = o.lvl(T) >= 2 ? o.pos(T) : o.ghost(T); if (!b) continue; g.strokeStyle = 'rgba(163,48,31,0.7)'; g.lineWidth = 1.3; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(this.X(a.x), this.Y(a.y)); g.lineTo(this.X(b.x), this.Y(b.y)); g.stroke(); g.setLineDash([]); }
    // 部隊：先畫陣形，再畫幟旗（旗永遠在陣形上面）
    const vis = us.map(u => ({ u, lvl: o.lvl(u), p: o.pos(u) })).filter(v => v.lvl >= 1).sort((a, b) => b.p.y - a.p.y);
    for (const v of vis) { if (v.lvl >= 2) this.block(v.u, v.p, o); }
    for (const v of vis) { if (v.lvl >= 2) this.banner(v.u, v.p, v.lvl, o); else { const gp = o.ghost(v.u); if (gp) this.blot(gp); } }
    // 接戰火花
    for (const v of vis) if (v.lvl >= 2) for (const id of v.u.contacts) if (id > v.u.id) { const T = S.units[id]; if (T.state === 'gone') continue; const q = o.pos(T); const x = (this.X(v.p.x) + this.X(q.x)) / 2, y = (this.Y(v.p.y) + this.Y(q.y)) / 2; const ph = this.clock * 9 + id; g.strokeStyle = 'rgba(255,246,216,0.95)'; g.lineWidth = 1.3; for (let i = 0; i < 5; i++) { const a = i * 1.257 + Math.floor(ph) * 0.7, r0 = 2 + (ph % 1) * 2, r1 = r0 + 4; g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); g.stroke(); } }
    // 檢視中的部隊、攻擊目標
    for (const [u, c] of [[o.info, 'rgba(42,29,20,0.7)'], [o.target, 'rgba(163,48,31,0.85)']] as [Unit | null, string][]) if (u && u.state !== 'gone' && o.lvl(u) >= 2) { const p = o.pos(u); g.strokeStyle = c; g.lineWidth = 1.4; g.beginPath(); g.arc(this.X(p.x), this.Y(p.y), (Math.max(u.width, u.depth) / 2 + 7) * k, 0, 7); g.stroke(); }
    this.effects(o.dt);
    // 忍者
    for (const n of S.ninjas) if (n.alive && o.showNinja(n)) {
      const x = this.X(n.x), y = this.Y(n.y), mine = n.side === 0;
      if (mine && o.ninRange) { g.strokeStyle = 'rgba(42,29,20,0.45)'; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.arc(x, y, 80 * k, 0, 7); g.stroke(); g.setLineDash([]); }
      g.fillStyle = '#1c1a22'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.strokeStyle = n.id === o.selNin ? '#e3c15a' : mine ? '#b5392b' : '#4a6fb0'; g.lineWidth = n.id === o.selNin ? 2.2 : 1.3; g.stroke();
      g.fillStyle = '#f1e6cf'; g.font = `700 7px ${FONT}`; g.textAlign = 'center'; g.fillText('忍', x, y + 2.6);
      if (n.detUntil > S.t) { g.fillStyle = '#a3301f'; g.font = `700 10px ${FONT}`; g.fillText('！', x + 8, y - 3); }
    }
    // 點地面的回饋
    if (this.flashM) { const f = this.flashM; f.t += o.dt || 0.016; const q = f.t / 0.6; if (q >= 1) this.flashM = null; else { g.strokeStyle = f.attack ? `rgba(163,48,31,${1 - q})` : `rgba(42,29,20,${1 - q})`; g.lineWidth = 1.6; g.beginPath(); g.arc(this.X(f.x), this.Y(f.y), (f.r ? f.r * (1.4 - q * 0.4) : 2 + q * 6) * k + 3, 0, 7); g.stroke(); } }
    // 視角模式：只看得到帶隊部隊的視野，外圍罩上暗霞；虛線圈是識別距離
    if (o.lead >= 0 && S.units[o.lead] && S.units[o.lead].state !== 'gone') {
      const L = S.units[o.lead], p = o.pos(L), x = this.X(p.x), y = this.Y(p.y);
      const gr = g.createRadialGradient(x, y, 125 * k, x, y, 230 * k); gr.addColorStop(0, 'rgba(46,34,22,0)'); gr.addColorStop(1, 'rgba(46,34,22,0.5)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(227,193,90,0.55)'; g.lineWidth = 1.2; g.setLineDash([6, 5]); g.beginPath(); g.arc(x, y, 80 * k, 0, 7); g.stroke(); g.setLineDash([]);
    }
    g.drawImage(this.deco, 0, 0, W, H);
    if (o.title) this.title();
  }

  private block(u: Unit, p: { x: number; y: number }, o: Draw2D) {
    const g = this.g, k = this.k, c = COL[u.side], x = this.X(p.x), y = this.Y(p.y);
    const wpx = Math.max(18, Math.max(u.width, 10) * k * 1.15), dpx = Math.max(8, Math.max(u.depth, 5) * k * 1.15);
    const rout = u.state === 'rout' || u.state === 'shattered', sel = o.selected.has(u.id);
    g.save(); g.translate(x, y); g.rotate(-u.f + Math.PI / 2);
    if (u.id === o.lead) { g.strokeStyle = `rgba(227,193,90,${0.55 + 0.35 * Math.sin(this.clock * 4)})`; g.lineWidth = 2; g.beginPath(); g.roundRect(-wpx / 2 - 7, -dpx / 2 - 7, wpx + 14, dpx + 14, 6); g.stroke(); }
    if (sel) { g.strokeStyle = '#e3c15a'; g.lineWidth = 3; g.beginPath(); g.roundRect(-wpx / 2 - 3, -dpx / 2 - 3, wpx + 6, dpx + 6, 3); g.stroke(); }
    g.fillStyle = 'rgba(42,29,20,0.18)'; g.fillRect(-wpx / 2 + 1.5, -dpx / 2 + 2, wpx, dpx);
    g.fillStyle = rout ? '#8a8378' : c.fill; g.strokeStyle = c.dark; g.lineWidth = 1; g.beginPath(); g.roundRect(-wpx / 2, -dpx / 2, wpx, dpx, 1.5); g.fill(); g.stroke();
    // 士兵：人數換成點，排成行列
    const cav = u.type === 'cav' || u.type === 'general'; const n = Math.max(1, Math.ceil(u.men / (k < 1.7 ? (cav ? 1.5 : 2.5) : 1)));
    const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * wpx / dpx)))), rows = Math.ceil(n / cols); const cw = (wpx - 3) / cols, ch = (dpx - 3) / rows, rr = Math.max(0.6, Math.min(cw, ch) * (cav ? 0.4 : 0.32));
    let left = n; const near = k >= 2.4, cs = Math.min(cw, ch); // 拉近時每個點換成小人（頭盔、身體、兵器；騎兵有馬）
    for (let r = 0; r < rows && left > 0; r++) for (let q = 0; q < cols && left > 0; q++, left--) {
      const px = -wpx / 2 + 1.5 + cw * (q + 0.5) + (rout ? Math.sin(u.id * 7 + q * 3 + this.clock * 6) * 1.5 : 0), py = -dpx / 2 + 1.5 + ch * (r + 0.5) + (rout ? Math.cos(u.id + r * 5 + this.clock * 6) * 1.5 : 0);
      if (!near) { g.fillStyle = c.man; g.beginPath(); g.arc(px, py, rr, 0, 7); g.fill(); continue; }
      if (cav) { g.fillStyle = '#6b4a2e'; g.beginPath(); g.ellipse(px, py + cs * 0.06, cs * 0.2, cs * 0.4, 0, 0, 7); g.fill(); g.fillStyle = '#3d2a1a'; g.beginPath(); g.arc(px, py - cs * 0.36, cs * 0.11, 0, 7); g.fill(); }
      // 足輕戴陣笠（淺色圓＋中心一點）；武士與騎馬武者戴兜（深色圓＋金色前立）
      if (u.type === 'samurai' || cav) { g.fillStyle = c.dark; g.beginPath(); g.arc(px, py, cs * (cav ? 0.17 : 0.25), 0, 7); g.fill(); g.fillStyle = '#e3c15a'; g.beginPath(); g.arc(px, py - cs * (cav ? 0.1 : 0.14), cs * 0.07, 0, 7); g.fill(); }
      else { g.fillStyle = c.man; g.strokeStyle = c.dark; g.lineWidth = Math.max(0.5, cs * 0.05); g.beginPath(); g.arc(px, py, cs * 0.27, 0, 7); g.fill(); g.stroke(); g.fillStyle = c.dark; g.beginPath(); g.arc(px, py, cs * 0.06, 0, 7); g.fill(); }
      if (rout) continue;
      g.strokeStyle = 'rgba(42,29,20,0.75)'; g.lineWidth = Math.max(0.6, cs * 0.05);
      if (u.type === 'spear') { g.beginPath(); g.moveTo(px + cs * 0.24, py + cs * 0.15); g.lineTo(px + cs * 0.24, py - cs * 0.85); g.stroke(); }
      else if (u.type === 'archer') { g.beginPath(); g.arc(px + cs * 0.05, py - cs * 0.12, cs * 0.3, -Math.PI * 0.85, -Math.PI * 0.15); g.stroke(); }
      else if (u.type === 'gun') { g.beginPath(); g.moveTo(px + cs * 0.2, py); g.lineTo(px + cs * 0.2, py - cs * 0.5); g.stroke(); }
      else if (u.type === 'samurai' || cav) { g.strokeStyle = 'rgba(245,245,240,0.9)'; g.beginPath(); g.moveTo(px + cs * 0.22, py - cs * 0.05); g.lineTo(px + cs * 0.4, py - cs * 0.42); g.stroke(); }
    }
    if (u.type === 'spear' && !rout && !near) { g.strokeStyle = 'rgba(42,29,20,0.55)'; g.lineWidth = 0.6; for (let q = 0; q < cols; q++) { const px = -wpx / 2 + 1.5 + cw * (q + 0.5); g.beginPath(); g.moveTo(px, -dpx / 2 + 1); g.lineTo(px, -dpx / 2 - 4); g.stroke(); } }
    g.fillStyle = c.dark; g.beginPath(); g.moveTo(0, -dpx / 2 - 6); g.lineTo(-3.5, -dpx / 2 - 1); g.lineTo(3.5, -dpx / 2 - 1); g.fill();
    g.restore();
    if (o.manual.has(u.id)) { g.fillStyle = '#e3c15a'; g.font = `700 9px ${FONT}`; g.textAlign = 'center'; g.fillText('手', x, y + dpx / 2 + 11); }
  }
  // 幟旗：家紋＋兵種字；士氣高昂有金色旗頂、動搖傾斜、潰走倒下（敵軍要洞悉才看得出動搖）
  private banner(u: Unit, p: { x: number; y: number }, lvl: number, o: Draw2D) {
    const g = this.g, k = this.k, c = COL[u.side]; const s = Math.max(0.85, Math.min(1.7, 0.8 + 0.28 * k));
    const dpx = Math.max(8, Math.max(u.depth, 5) * k * 1.15), ang = -u.f;
    const bx = this.X(p.x) - Math.cos(ang) * (dpx / 2 + 3), by = this.Y(p.y) - Math.sin(ang) * (dpx / 2 + 3) - 2;
    const rout = u.state === 'rout' || u.state === 'shattered', wav = u.state === 'waver' && lvl >= 3;
    g.save(); g.translate(bx, by); g.scale(s, s); g.rotate(rout ? 1.15 : wav ? 0.3 + Math.sin(this.clock * 5 + u.id) * 0.06 : 0);
    g.strokeStyle = '#3b2a1a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -27); g.moveTo(0, -26); g.lineTo(11, -26); g.stroke();
    g.fillStyle = rout ? '#9a9388' : c.fill; g.strokeStyle = o.selected.has(u.id) ? '#e3c15a' : c.dark; g.lineWidth = o.selected.has(u.id) ? 1.6 : 0.8; g.beginPath(); g.rect(1, -26, 10.5, 21); g.fill(); g.stroke();
    if (u.side === 0) { g.fillStyle = '#1c1410'; for (const [dx, dy] of [[0, -1.9], [-1.9, 0], [1.9, 0], [0, 1.9]]) { g.beginPath(); g.moveTo(6.2 + dx, -24.1 + dy); g.lineTo(7.7 + dx, -22.6 + dy); g.lineTo(6.2 + dx, -21.1 + dy); g.lineTo(4.7 + dx, -22.6 + dy); g.fill(); } }
    else { g.fillStyle = '#eef1f6'; g.font = `700 6.5px ${FONT}`; g.textAlign = 'center'; g.fillText('毘', 6.2, -20.2); }
    g.fillStyle = '#fbf4e2'; g.font = `700 10px ${FONT}`; g.textAlign = 'center'; g.fillText(KAN[u.type], 6.3, -8.3);
    if (u.state === 'high' && lvl >= 3) { g.fillStyle = '#e3c15a'; g.beginPath(); g.arc(0, -28, 1.8, 0, 7); g.fill(); }
    if (u.merit > 0) { g.fillStyle = '#e3c15a'; g.font = `700 6px ${FONT}`; g.textAlign = 'left'; g.fillText('★'.repeat(Math.min(3, u.merit)), 1, -28.5); }
    g.restore();
    if (u.cmd && k > 0.75) { const nm = u.cmd.slice(-2); g.font = `700 ${Math.round(9 * s)}px ${FONT}`; g.textAlign = 'center'; [...nm].forEach((ch, i) => { const tx = bx + 18 * s, ty = by - 18 * s + i * 9.5 * s; g.strokeStyle = 'rgba(244,234,208,0.9)'; g.lineWidth = 2.6; g.strokeText(ch, tx, ty); g.fillStyle = c.name; g.fillText(ch, tx, ty); }); }
  }
  private blot(p: { x: number; y: number }) {
    const g = this.g, x = this.X(p.x), y = this.Y(p.y);
    for (let i = 0; i < 4; i++) { const gr = g.createRadialGradient(x + Math.sin(i * 2.1) * 5, y + Math.cos(i * 1.7) * 4, 1, x, y, 16); gr.addColorStop(0, 'rgba(60,62,78,0.36)'); gr.addColorStop(1, 'rgba(60,62,78,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 17, 0, 7); g.fill(); }
    g.font = `700 14px ${FONT}`; g.textAlign = 'center'; g.fillStyle = 'rgba(30,32,44,0.85)'; g.fillText('？', x, y + 5);
  }
  private effects(dt: number) {
    const g = this.g, k = this.k;
    // 損員 → 墨點
    for (const u of this.S.units) { const prev = this.lastMen.get(u.id) ?? u.men; if (u.men < prev && u.state !== 'gone') { const n = Math.min(4, prev - u.men); for (let i = 0; i < n; i++) this.marks.push({ x: u.x + (this.r() - 0.5) * Math.max(u.width, 10), y: u.y + (this.r() - 0.5) * Math.max(u.depth, 8), s: 0.8 + this.r() * 0.8 }); } this.lastMen.set(u.id, u.men); }
    if (this.marks.length > 500) this.marks.splice(0, this.marks.length - 500);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; if (f.delay && f.delay > 0) { f.delay -= dt; continue; }
      f.t += dt; const q = f.t / f.dur; if (q >= 1) { this.fx.splice(i, 1); continue; }
      if (f.k === 'arrow') { const x = f.x + (f.x1! - f.x) * q, y = f.y + (f.y1! - f.y) * q, arc = Math.sin(q * Math.PI) * 10; const q2 = Math.max(0, q - 0.08), x2 = f.x + (f.x1! - f.x) * q2, y2 = f.y + (f.y1! - f.y) * q2, arc2 = Math.sin(q2 * Math.PI) * 10; g.strokeStyle = 'rgba(42,29,20,0.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(this.X(x2), this.Y(y2) - arc2 * k); g.lineTo(this.X(x), this.Y(y) - arc * k); g.stroke(); }
      else if (f.k === 'puff') { g.fillStyle = `rgba(${f.c ?? '236,232,222'},${0.55 * (1 - q)})`; g.beginPath(); g.arc(this.X(f.x), this.Y(f.y) - q * 8, (f.r! * (0.6 + q)) * k, 0, 7); g.fill(); }
      else if (f.k === 'ring') { g.strokeStyle = `rgba(${f.c},${0.7 * (1 - q)})`; g.lineWidth = 1.6; g.beginPath(); g.arc(this.X(f.x), this.Y(f.y), f.r! * q * k, 0, 7); g.stroke(); }
      else if (f.k === 'star') { const x = this.X(f.x), y = this.Y(f.y), rr = f.r! * (0.5 + q) * Math.max(1, k * 0.8); g.strokeStyle = `rgba(255,246,216,${1 - q})`; g.lineWidth = 2; for (let j = 0; j < 8; j++) { const a = j * 0.785; g.beginPath(); g.moveTo(x + Math.cos(a) * rr * 0.4, y + Math.sin(a) * rr * 0.4); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); g.stroke(); } }
    }
  }
}
