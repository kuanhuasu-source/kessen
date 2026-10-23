// 《決戰》士氣模擬器 — 核心模擬（部隊層級，固定時間步長）
import { UT, MAP, CLANS, STEALTH_R, ROSTER_T, ROSTER_U, STREAMS, isRangedType, type Side, type UType, type RosterEntry } from './data.ts';
import type { Rules } from './rules.ts';

export type Formation = 'line' | 'dense' | 'loose';
export type MState = 'high' | 'steady' | 'waver' | 'rout' | 'shattered' | 'gone';
export type Effect = { id: string; until: number; act?: number; v?: number };
type Ev = { t: number; d: number; src: string };

export type Unit = {
  id: number; side: Side; key: string; type: UType; cmd: string; cmdAlive: boolean;
  skill: string | null; passive: string | null; strategy: string | null; advPassive: string | null;
  advisor: string | null; advAlive: boolean; reinf: boolean;
  men0: number; men: number; hpPer: number; hp: number;
  x: number; y: number; f: number; form: Formation;
  ranks: number; sp: number; width: number; depth: number; rad: number;
  morale: number; moraleStart: number; state: MState; routCount: number;
  lastDmgT: number; lastArrowT: number; lossSteps: number; lastFriendRoutT: number;
  destX: number; destY: number; hasDest: boolean; run: boolean; runDist: number; chargeUntil: number;
  primary: number; contacts: number[];
  ammo: number; ammoMax: number; reload: number; supplyAcc: number; fireTarget: number;
  skillCd: number; cryCd: number; eff: Effect[]; noRegenUntil: number;
  merit: number; lastHitBy: number; // 戰場功績、最後打到我的敵隊（功績歸屬）
  retreating: boolean; disUntil: number;
  recent: Ev[]; effHist: number[];
  maxDrop5: number; maxDrop5Srcs: string; maxShock5: number;
  // AI 狀態
  role: string; target: number; targetT: number; holdX: number; holdY: number; ambush: boolean;
  cavPhase: string; cavPhaseT: number; huntNinja: number; fakeType: UType | null; fakeUntil: number;
  aiLockK: string; aiLockT: number; // AI 決策鎖（止抖）
  // 玩家指令：陣列寬度（列數）與抵達後的朝向
  filesWanted: number; finalF: number;
};

// Ninja.autoAt：手動指派到期後交回自動偵察
export type Ninja = { wp?: number; autoAt?: number; id: number; side: Side; x: number; y: number; alive: boolean; detUntil: number;
  immuneUntil: number; nearT: number; role: string; tx: number; ty: number; fleeUntil: number; manual?: boolean };

export type Point = { id: string; x: number; y: number; owner: -1 | Side; prog: number; progSide: -1 | Side;
  burnedUntil: number; ownSince: number };

export type Rec = {
  uNeg: [Record<string, number>, Record<string, number>];
  uPos: [Record<string, number>, Record<string, number>];
  aNeg: [Record<string, number>, Record<string, number>];
  aPos: [Record<string, number>, Record<string, number>];
  prevented: Record<string, number>;
  routs: { t: number; side: Side; key: string; type: UType; cause: Record<string, number>; instant: boolean;
    eff5: number; friendTrig: boolean; n: number; wipe: boolean; x?: number; y?: number; ret?: boolean; effNow?: number; men0?: number }[];
  armyDrops: { side: Side; t: number; total: number; srcs: Record<string, number> }[];
  maxArmyDrop10: [number, number]; maxArmyDrop10Srcs: [Record<string, number>, Record<string, number>];
  series: number[][];
  skillUse: Record<string, number>; jutsuUse: Record<string, number>;
  cmdDeaths: { t: number; side: Side; who: string; how: string }[];
  firstRoutT: [number, number];
  fled: [number, number]; wipes: { t: number; side: Side; active: boolean }[];
  nin: { assTry: number; assKill: number; dead: number; deadT: number[]; detected: number; jutsu: Record<string, number> }[];
  visAcc: { n: number; id2: number; id3: number; any1: number }[];
};

export type State = {
  t: number; dt: number; R: Rules; rng: () => number;
  units: Unit[]; ninjas: Ninja[]; army: [number, number];
  armyRecent: [Ev[], Ev[]];
  points: Point[]; holdAll: [number, number];
  reinfUsed: [number, number]; reinfT: [number, number];
  clan: [string, string]; jutsuCd: [number, number]; kanpaUntil: [number, number];
  vis: [Uint8Array, Uint8Array]; noisy: [Map<number, { x: number; y: number; t: number }>, Map<number, { x: number; y: number; t: number }>];
  secrets: { marsh: { x: number; y: number }[]; trailX: number; ambush: { x: number; y: number }[] };
  known: [Set<string>, Set<string>];
  // 情報 v2：觀察累積、記憶（最後看到的等級與位置）、已探索格（40×28 格，每格 25 m）
  obs: [Map<number, { t2: number; t3: number }>, Map<number, { t2: number; t3: number }>];
  mem: [Map<number, { lvl: number; t: number; x: number; y: number }>, Map<number, { lvl: number; t: number; x: number; y: number }>];
  explored: [Uint8Array, Uint8Array];
  lastContactT: number; // 最後一次有任何接戰的時間
  smokes: { side: Side; x: number; y: number; until: number }[];
  monomi: { side: Side; x: number; y: number; until: number }[];
  phantoms: [{ x: number; y: number; until: number }[], { x: number; y: number; t?: number; until: number }[]];
  pairs: Map<number, { onset: number; last: number }>;
  kurumaAct: number; kurumaHit: Set<string>;
  rec: Rec; over: null | { winner: -1 | Side; type: string; t: number };
  meta: Record<string, unknown>;
  ai: any;
  fx?: FxEv[];   // 遊戲畫面用的事件（批次模擬不使用）
};

// ---------------- 工具 ----------------
export type FxEv = { k: 'volley' | 'charge' | 'blocked' | 'flank' | 'rear' | 'water' | 'rout' | 'shatter' | 'rally' | 'cmd' | 'adv' | 'chain' | 'cheer' | 'army' | 'surround' | 'found' | 'skill' | 'strat' | 'cry' | 'jutsu' | 'ninjaDead' | 'merit'; a: number; b?: number; n?: number; s?: string };
const fx = (S: State, e: FxEv) => { S.fx?.push(e); };

export function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function poisson(rng: () => number, lam: number): number {
  if (lam <= 0) return 0;
  if (lam > 30) { // 常態近似
    const u1 = Math.max(1e-12, rng()), u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.round(lam + Math.sqrt(lam) * z));
  }
  const L = Math.exp(-lam); let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}
export const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
export function angDiff(a: number, b: number) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
// 地形高度：幾座圓丘（寺廟小丘、東南與西北的高地、兩個小土丘）加上起伏不到 2 m 的緩坡
const RELIEF = { noise: 1, hills: true }; // 由 newState 依規則設定（height() 到處被呼叫，不帶 S）
export function height(x: number, y: number) {
  let h = 0;
  for (const k of MAP.hills) { if (!RELIEF.hills && k !== MAP.hills[0]) continue; const d = Math.hypot(x - k.x, y - k.y); if (d < k.r) { const u = 1 - d / k.r; h += k.h * u * u * (3 - 2 * u); } }
  h += (1.1 * Math.sin(x / 97) * Math.cos(y / 83) + 0.7 * Math.sin((x + y) / 61) + 1.8) * RELIEF.noise;
  return Math.max(0, h);
}
export function inForest(x: number, y: number) { const f = MAP.forest; return x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1; }
export function inPaddy(x: number, y: number) { const p = MAP.paddy; return x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1; }
export function inMarsh(S: State, x: number, y: number) { for (const m of S.secrets.marsh) if (Math.hypot(x - m.x, y - m.y) <= MAP.marshR) return true; return false; }
export function onTrail(S: State, x: number, y: number) { return inForest(x, y) && Math.abs(x - S.secrets.trailX) <= 7; }
// 水域：0 不在水中、1 涉水、2 渡口（淺灘）
export function inWater(S: State, x: number, y: number): 0 | 1 | 2 {
  const ss = STREAMS[S.R.streams]; if (!ss || !ss.length) return 0;
  for (const st of ss) {
    let best = 1e9;
    for (let i = 0; i < st.pts.length - 1; i++) {
      const [ax, ay] = st.pts[i], [bx, by] = st.pts[i + 1];
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
      const k = clamp(((x - ax) * vx + (y - ay) * vy) / L2, 0, 1);
      const d = Math.hypot(ax + vx * k - x, ay + vy * k - y); if (d < best) best = d;
    }
    if (best <= st.w / 2) return st.fords.some(f => Math.hypot(f.x - x, f.y - y) <= f.r) ? 2 : 1;
  }
  return 0;
}
export function inAmbush(S: State, x: number, y: number) { for (const a of S.secrets.ambush) if (Math.hypot(x - a.x, y - a.y) <= MAP.ambushR) return true; return false; }
// X 相對於 Y 的方位：0 正面（±60°）、1 側面、2 背面（≥120°）
export function cat(X: { x: number; y: number }, Y: Unit) {
  const a = Math.atan2(X.y - Y.y, X.x - Y.x); const d = Math.abs(angDiff(a, Y.f));
  return d <= Math.PI / 3 ? 0 : d < 2 * Math.PI / 3 ? 1 : 2;
}
export const isCav = (u: Unit) => UT[u.type].cav;
export const isRanged = (u: Unit) => isRangedType(u.type); // 弓、鐵砲、大筒
export const onField = (u: Unit) => u.state !== 'gone';
export const active = (u: Unit) => u.state === 'high' || u.state === 'steady' || u.state === 'waver';
export const fighting = (u: Unit, t: number) => active(u) && !u.retreating && u.disUntil <= t;
export function has(S: State, u: Unit, id: string) { for (const e of u.eff) if (e.id === id && e.until > S.t) return true; return false; }
export function addEff(S: State, u: Unit, id: string, dur: number, act?: number) {
  u.eff = u.eff.filter(e => e.id !== id); u.eff.push({ id, until: S.t + dur, act });
}
let PASSIVES = true; let OFF: string[] = [];
export function setPassives(on: boolean, off: string[] = []) { PASSIVES = on; OFF = off; }
export function passiveOn(u: Unit, p: string) { return PASSIVES && u.cmdAlive && u.passive === p && !OFF.includes(p) && (active(u) || p === 'nigedanjo'); }
export function general(S: State, side: Side) { return S.units.find(u => u.side === side && u.type === 'general')!; }
export function advisorPassive(S: State, side: Side, p: string) { const g = general(S, side); return S.R.passivesOn && !S.R.offPassives.includes(p) && g.advAlive && active(g) && g.advPassive === p; }

export function updDims(u: Unit) {
  const cav = UT[u.type].cav;
  u.ranks = cav ? 2 : (u.form === 'dense' ? 8 : 4);
  if (u.filesWanted > 0 && u.form === 'line') u.ranks = Math.max(cav ? 1 : 2, Math.min(12, Math.ceil(u.men / u.filesWanted)));
  u.sp = u.form === 'loose' ? 3.6 : 1.8;
  const files = Math.max(1, Math.ceil(u.men / u.ranks));
  u.width = files * u.sp; u.depth = Math.min(u.ranks, Math.max(1, u.men)) * u.sp;
  u.rad = Math.max(u.width, u.depth) * 0.25 + 4;
}

// ---------------- 建立對局 ----------------
export function makeUnit(S: State, side: Side, r: RosterEntry | null, type: UType, key: string, x: number, y: number): Unit {
  const T = UT[type];
  const u: Unit = {
    id: S.units.length, side, key, type, cmd: r ? r.cmd : '', cmdAlive: !!r,
    skill: r ? r.skill : null, passive: r ? r.passive : null, strategy: r?.strategy ?? null,
    advPassive: r?.advisorPassive ?? null, advisor: r?.advisor ?? null, advAlive: !!r?.advisor, reinf: !r,
    men0: T.men, men: T.men, hpPer: T.hp, hp: T.men * T.hp,
    x, y, f: side === 0 ? Math.PI / 2 : -Math.PI / 2, form: 'line', ranks: 4, sp: 1.8, width: 0, depth: 0, rad: 0,
    morale: 0, moraleStart: 0, state: 'steady', routCount: 0,
    lastDmgT: -99, lastArrowT: -99, lossSteps: 0, lastFriendRoutT: -999,
    destX: x, destY: y, hasDest: false, run: false, runDist: 0, chargeUntil: -1,
    primary: -1, contacts: [], ammo: T.ammo, ammoMax: T.ammo, reload: 0, supplyAcc: 0, fireTarget: -1,
    skillCd: 0, cryCd: 0, eff: [], noRegenUntil: -1, merit: 0, lastHitBy: -1, retreating: false, disUntil: -1,
    recent: [], effHist: [], maxDrop5: 0, maxDrop5Srcs: '', maxShock5: 0,
    role: '', target: -1, targetT: -99, holdX: x, holdY: y, ambush: false,
    cavPhase: 'idle', cavPhaseT: 0, huntNinja: -1, fakeType: null, fakeUntil: -1,
    aiLockK: '', aiLockT: -99,
    filesWanted: 0, finalF: NaN,
  };
  if (u.passive === 'ammo5' && S.R.passivesOn) { u.ammo += 5; u.ammoMax += 5; }
  let m0 = Math.min(100, T.morale + 40);
  if (side === 0 && S.R.passivesOn && ROSTER_T[0].passive === 'hitowa' && !S.R.offPassives.includes('hitowa')) m0 = Math.min(100, m0 + S.R.hitowaStart); // 人は城
  u.morale = u.moraleStart = m0;
  updDims(u);
  S.units.push(u);
  return u;
}

export function newState(R: Rules, seed: number, clan: [string, string]): State {
  const rng = mulberry32(seed);
  setPassives(R.passivesOn, R.offPassives);
  RELIEF.noise = R.reliefNoise; RELIEF.hills = R.reliefHills;
  const pick = <T>(arr: T[], n: number) => { const a = arr.slice(); const out: T[] = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(rng() * a.length), 1)[0]); return out; };
  const S: State = {
    t: 0, dt: 0.25, R, rng, units: [], ninjas: [], army: [100, 100], armyRecent: [[], []],
    points: MAP.points.map(p => ({ id: p.id, x: p.x, y: p.y, owner: -1 as -1, prog: 0, progSide: -1 as -1, burnedUntil: -1, ownSince: 0 })),
    holdAll: [0, 0], reinfUsed: [0, 0], reinfT: [0, 0], clan, jutsuCd: [0, 0], kanpaUntil: [-1, -1],
    vis: [new Uint8Array(64), new Uint8Array(64)], noisy: [new Map(), new Map()],
    secrets: { marsh: pick(MAP.marshCand, 2), trailX: MAP.trailCand[Math.floor(rng() * 2)], ambush: pick(MAP.ambushCand, 2) },
    known: [new Set(), new Set()], smokes: [], monomi: [], phantoms: [[], []], pairs: new Map(),
    obs: [new Map(), new Map()], mem: [new Map(), new Map()], explored: [new Uint8Array(40 * 28), new Uint8Array(40 * 28)], lastContactT: 0,
    kurumaAct: 0, kurumaHit: new Set(),
    rec: {
      uNeg: [{}, {}], uPos: [{}, {}], aNeg: [{}, {}], aPos: [{}, {}], prevented: {}, routs: [], armyDrops: [],
      maxArmyDrop10: [0, 0], maxArmyDrop10Srcs: [{}, {}], series: [], skillUse: {}, jutsuUse: {}, cmdDeaths: [], firstRoutT: [-1, -1], fled: [0, 0], wipes: [], nin: [0, 1].map(() => ({ assTry: 0, assKill: 0, dead: 0, deadT: [], detected: 0, jutsu: {} })), visAcc: [0, 1].map(() => ({ n: 0, id2: 0, id3: 0, any1: 0 })),
    },
    over: null, meta: {}, ai: null,
  };
  // 地形秘密的事前知識（依忍者眾情報力）
  const secretIds = ['m0', 'm1', 'trail', 'a0', 'a1'];
  for (const s of [0, 1] as Side[]) {
    const intel = !R.ninjaOn || !R.ninjaSides[s] ? 'low' : clan[s] === 'nokizaru' ? R.nokizaruIntel : CLANS[clan[s]].intel;
    if (R.fogV2) { // v2：只知道己方半場的秘密（情報高：全部；中：一半），敵方半場要靠偵察
      const own = (p: { x: number; y: number }) => s === 0 ? p.y < 350 : p.y > 350;
      const ids: string[] = []; S.secrets.marsh.forEach((m, i) => { if (own(m)) ids.push('m' + i); }); S.secrets.ambush.forEach((a, i) => { if (own(a)) ids.push('a' + i); });
      const n = intel === 'high' ? ids.length : intel === 'mid' ? Math.ceil(ids.length / 2) : 0;
      for (const id of pick(ids, n)) S.known[s].add(id);
      continue;
    }
    const n = intel === 'high' ? 5 : intel === 'mid' ? (rng() < 0.5 ? 2 : 3) : 0;
    for (const id of pick(secretIds, n)) S.known[s].add(id);
  }
  return S;
}

// ---------------- 士氣 ----------------
export function contBonus(S: State, u: Unit): number {
  const R = S.R; let b = 0;
  if (R.batteredFrac > 0 && u.men < R.batteredFrac * u.men0) return 0;
  const g = general(S, u.side);
  if (g.cmdAlive && active(g)) {
    const r = passiveOn(g, 'bishamon') ? R.bishamonR : R.genAuraR;
    if (dist(u, g) <= r) b += R.genAura;
  }
  const tp = S.points[1];
  if (tp.owner === u.side && tp.burnedUntil <= S.t && dist(u, tp) <= R.templeR) b += R.templeAura;
  if (u.side === 0) {
    const s1 = S.meta.tenkyu as Unit | undefined; // 武田信繁（samurai1）
    if (s1 && passiveOn(s1, 'tenkyu') && active(s1) && dist(u, s1) <= R.tenkyuR) b += R.tenkyuAura;
  }
  return Math.min(b, R.contCap);
}
export function effM(S: State, u: Unit) { return clamp(u.morale + contBonus(S, u), 0, 100); }

function addRec(o: Record<string, number>, k: string, v: number) { o[k] = (o[k] || 0) + v; }

export function mHit(S: State, u: Unit, amt: number, src: string, oneOff = true) {
  if (amt === 0 || u.state === 'gone') return;
  const R = S.R, t = S.t, before = u.morale;
  if (amt > 0) {
    u.morale = Math.min(100, before + amt);
    addRec(S.rec.uPos[u.side], src, u.morale - before);
    return;
  }
  let a = amt;
  const engaged = u.contacts.length > 0;
  if (R.furinDmpPct > 0 && has(S, u, 'furin') && engaged) a *= 1 - R.furinDmpPct;
  if (R.shingariDmpPct > 0 && has(S, u, 'shingari')) a *= 1 - R.shingariDmpPct;
  if (R.shockCap > 0 && oneOff && src !== 'losses') { // 傷亡不受衝擊上限限制
    let used = 0; for (const e of u.recent) if (t - e.t <= 5 && e.src !== '_drain' && e.src !== 'losses') used += e.d;
    const room = -R.shockCap - used; // 例：上限 30、已扣 20 → room = -10
    a = room >= 0 ? 0 : Math.max(a, room);
  }
  let nm = before + a;
  const cont = contBonus(S, u);
  let floor = -1e9;
  if (R.furinFloor > 0 && has(S, u, 'furin') && engaged) floor = R.furinFloor - cont;
  if (R.shingariFloorOn && has(S, u, 'shingari')) floor = Math.max(floor, R.routAt - cont);
  if (nm < floor && before >= floor) nm = floor; // 只在由上往下跨越時生效
  nm = clamp(nm, 0, 100);
  const d = nm - before;
  const wanted = Math.max(amt, -before); // 不計歸零的情況下原本應扣的量
  if (d - wanted > 1e-9) addRec(S.rec.prevented, src, d - wanted); // 被下限、減免或上限擋掉的量
  u.morale = nm;
  if (d < 0) {
    addRec(S.rec.uNeg[u.side], src, d);
    u.recent.push({ t, d, src: oneOff ? src : '_drain' });
    // 5 秒視窗內的瞬間事件累計跌幅
    let sum = 0; const srcs: Record<string, number> = {};
    for (const e of u.recent) if (t - e.t <= 5 && e.src !== '_drain') { sum += e.d; srcs[e.src] = (srcs[e.src] || 0) + e.d; }
    if (sum < u.maxDrop5) { u.maxDrop5 = sum; u.maxDrop5Srcs = Object.keys(srcs).sort().join('+'); }
    const shock = sum - (srcs['losses'] || 0);
    if (shock < u.maxShock5) u.maxShock5 = shock;
  }
}

export function aHit(S: State, side: Side, amt: number, src: string) {
  const R = S.R, t = S.t, before = S.army[side];
  if (amt > 0) { S.army[side] = Math.min(100, before + amt); addRec(S.rec.aPos[side], src, S.army[side] - before); fx(S, { k: 'army', a: side, n: S.army[side] - before, s: src }); return; }
  let a = amt;
  const rec = S.armyRecent[side];
  if (R.aCap10s > 0) {
    let used = 0; for (const e of rec) if (t - e.t <= 10) used += e.d;
    const room = -R.aCap10s - used; a = room >= 0 ? 0 : Math.max(a, room);
    if (a !== amt) addRec(S.rec.prevented, 'army:' + src, a - amt);
  }
  S.army[side] = clamp(before + a, 0, 100);
  const d = S.army[side] - before;
  if (d < 0) fx(S, { k: 'army', a: side, n: d, s: src });
  if (d < 0) {
    addRec(S.rec.aNeg[side], src, d);
    rec.push({ t, d, src });
    let sum = 0; const srcs: Record<string, number> = {};
    for (const e of rec) if (t - e.t <= 10) { sum += e.d; srcs[e.src] = (srcs[e.src] || 0) + e.d; }
    if (sum < S.rec.maxArmyDrop10[side]) { S.rec.maxArmyDrop10[side] = sum; S.rec.maxArmyDrop10Srcs[side] = srcs; }
  }
}

function causeOf(u: Unit, t: number) {
  const c: Record<string, number> = {};
  for (const e of u.recent) if (t - e.t <= 10) c[e.src === '_drain' ? 'drain' : e.src] = (c[e.src === '_drain' ? 'drain' : e.src] || 0) + e.d;
  return c;
}

export function rout(S: State, u: Unit, wipe = false) {
  const R = S.R, t = S.t;
  if (u.state === 'rout' || u.state === 'shattered' || u.state === 'gone') return;
  u.routCount++;
  const shatter = wipe || u.routCount >= R.maxRouts;
  const eff5 = u.effHist.length >= 6 ? u.effHist[u.effHist.length - 6] : 100;
  const cause = wipe ? { wipe: -1 } : causeOf(u, t);
  if (!wipe && Object.keys(cause).length === 0) cause['auraLoss'] = -1; // 沒有扣分事件，是持續加成消失
  const friendTrig = (cause['friendRout'] || 0) <= -5;
  S.rec.routs.push({ t, side: u.side, key: u.key, type: u.type, cause, instant: !wipe && eff5 >= 50, eff5, friendTrig, n: u.routCount, wipe, x: u.x, y: u.y, ret: u.retreating, effNow: effM(S, u), men0: u.men0 });
  if (S.rec.firstRoutT[u.side] < 0) S.rec.firstRoutT[u.side] = t;
  u.state = shatter ? 'shattered' : 'rout';
  fx(S, { k: shatter ? 'shatter' : 'rout', a: u.id });
  if (R.meritOn && !wipe) { const K = S.units[u.lastHitBy]; if (K && K.side !== u.side && active(K)) addMerit(S, K, 1, 'rout'); }
  u.retreating = false; u.primary = -1;
  if (!(u.type === 'general' && R.bannerReplaces)) aHit(S, u.side, R.aRout, 'unitRout');
  if (shatter) aHit(S, u.side, R.aShatter, 'unitShatter');
  if (u.type === 'general') aHit(S, u.side, R.aBannerFall, 'bannerFall');
  aHit(S, (1 - u.side) as Side, R.aEnemyRout, 'enemyRout');
  for (const v of S.units) {
    if (v === u || !active(v) || dist(u, v) > R.friendlyRoutR) continue;
    if (v.side === u.side) {
      if (R.friendlyRoutCd > 0 && t - v.lastFriendRoutT < R.friendlyRoutCd) continue;
      v.lastFriendRoutT = t; const b = v.morale; mHit(S, v, R.friendlyRout, 'friendRout');
      fx(S, { k: 'chain', a: v.id, b: u.id, n: v.morale - b });
    } else { mHit(S, v, R.enemyRoutNear, 'enemyRoutNear'); fx(S, { k: 'cheer', a: v.id, b: u.id, n: R.enemyRoutNear }); }
  }
}

export function cmdDeath(S: State, u: Unit, who: 'cmd' | 'adv', how: string, killer?: Unit) {
  const R = S.R;
  if (who === 'cmd') {
    if (!u.cmdAlive) return;
    u.cmdAlive = false;
    if (u.state !== 'gone' && how !== 'wipe') mHit(S, u, R.cmdDeathUnit, 'cmdDeath');
    if (u.type === 'general') aHit(S, u.side, R.aGenDeath, 'genDeath'); else aHit(S, u.side, R.aViceDeath, 'viceDeath');
  } else {
    if (!u.advAlive) return;
    u.advAlive = false; aHit(S, u.side, R.aAdvisorDeath, 'advisorDeath');
  }
  fx(S, { k: who, a: u.id });
  S.rec.cmdDeaths.push({ t: S.t, side: u.side, who: who === 'cmd' ? (u.type === 'general' ? 'general' : 'vice') : 'advisor', how });
  if (killer && active(killer)) mHit(S, killer, R.killCmd, 'killCmd');
  if (R.meritOn && who === 'cmd' && killer && active(killer)) addMerit(S, killer, u.type === 'general' ? 3 : 2, u.type === 'general' ? 'gen' : 'cmd');
}
// 戰場功績：擊潰敵隊或討取武將的部隊得功；每得功士氣提升，攻擊依功績加成（見 meleeAttack／volley）
export function addMerit(S: State, u: Unit, n: number, why: string) {
  u.merit += n; mHit(S, u, S.R.meritMorale, 'merit');
  fx(S, { k: 'merit', a: u.id, n: u.merit, s: why });
}
export const meritMul = (S: State, u: Unit) => S.R.meritOn ? 1 + S.R.meritAtk * Math.min(S.R.meritMax, u.merit) : 1;

// ---------------- 技能 ----------------
export function skillBlocked(S: State, side: Side) { return S.R.kanpaOn && S.kanpaUntil[side] > S.t; }

export function useSkill(S: State, u: Unit, targetId = -1): boolean {
  const R = S.R, t = S.t;
  if (!R.skillsOn || !u.skill || !u.cmdAlive || !active(u) || u.skillCd > t || skillBlocked(S, u.side)) return false;
  const main = u.type === 'general';
  let cd = main ? 120 : 60;
  if (u.side === 0 && advisorPassive(S, 0, 'heiho')) cd *= 0.8; // 兵法家
  const sk = u.skill;
  switch (sk) {
    case 'fujimi': addEff(S, u, 'dmg50', 10); break;
    case 'teppeki': u.form = 'dense'; updDims(u); addEff(S, u, 'noFlankMorale', 15); break;
    case 'koshu': addEff(S, u, 'koshu', 15); break;
    case 'kyusha': case 'sandan': addEff(S, u, 'rapid', 15); break;
    case 'toseki': {
      const tg = S.units[targetId]; if (!tg || !onField(tg) || dist(u, tg) > 50) return false;
      const hits = poisson(S.rng, u.men * 0.35); damage(S, tg, hits * R.arrowDmg, u); mHit(S, tg, R.tosekiMorale, 'toseki'); break;
    }
    case 'assei': { const tg = S.units[targetId]; if (!tg) return false; addEff(S, tg, 'slow30', 15); break; }
    case 'kesshi': case 'senpo': addEff(S, u, 'atk30', 20); break;
    case 'shinsa': addEff(S, u, 'shinsa', 15); break;
    case 'akazonae': case 'shoki': addEff(S, u, 'charge15', 15); addEff(S, u, 'speed30', 15); addEff(S, u, 'chargeShock', 15); break;
    case 'kobu': mHit(S, u, R.kobu, 'kobu'); break;
    case 'shingari': addEff(S, u, 'shingari', 15); break;
    case 'furin':
      for (const v of S.units) if (v.side === u.side && onField(v)) { addEff(S, v, 'speed20', 20); addEff(S, v, 'furin', 20); }
      break;
    case 'kuruma': {
      S.kurumaAct++;
      for (const v of S.units) if (v.side === u.side && active(v) && !isRanged(v) && dist(u, v) <= 100) addEff(S, v, 'kuruma', 20, S.kurumaAct);
      break;
    }
    default: return false;
  }
  u.skillCd = t + cd;
  fx(S, { k: 'skill', a: u.id, b: targetId >= 0 ? targetId : undefined, s: sk });
  S.rec.skillUse[sk] = (S.rec.skillUse[sk] || 0) + 1;
  return true;
}

export function useStrategy(S: State, side: Side): boolean {
  const R = S.R, t = S.t, g = general(S, side);
  if (!R.strategyOn || !g.advAlive || !g.strategy || !active(g) || t < 60 || skillBlocked(S, side)) return false;
  if ((g as any).stratCd > t) return false;
  if (g.strategy === 'kitsutsuki') { for (const v of S.units) if (v.side === side && onField(v)) addEff(S, v, 'kitsutsuki', S.R.kitsutsukiDur); }
  else if (g.strategy === 'kanpa') { S.kanpaUntil[(1 - side) as Side] = t + S.R.kanpaDur; }
  (g as any).stratCd = t + 150;
  fx(S, { k: 'strat', a: g.id, s: g.strategy });
  S.rec.skillUse[g.strategy] = (S.rec.skillUse[g.strategy] || 0) + 1;
  return true;
}

export function battleCry(S: State, u: Unit) {
  const R = S.R;
  if (!R.cryOn || !active(u) || u.cryCd > S.t) return false;
  if (R.cryMinMorale > 0 && effM(S, u) < R.cryMinMorale) return false;
  u.cryCd = S.t + R.cryCd;
  fx(S, { k: 'cry', a: u.id });
  mHit(S, u, R.cryOwn, 'cry');
  for (const v of S.units) if (v.side !== u.side && active(v) && dist(u, v) <= R.cryR) mHit(S, v, R.cryEnemy, 'enemyCry');
  S.rec.skillUse['cry'] = (S.rec.skillUse['cry'] || 0) + 1;
  return true;
}

// ---------------- 忍術 ----------------
export function useJutsu(S: State, side: Side, j: string, a: { x: number; y: number; unit?: number; point?: number; ninja?: number }): boolean {
  const R = S.R, t = S.t;
  if (!R.ninjaOn || S.jutsuCd[side] > t || R.offJutsu.includes(j)) return false;
  if (R.clanPassive && CLANS[S.clan[side]].jutsu[0] !== j) return false; // 只有主動忍術能施放
  const nin = S.ninjas.filter(n => n.side === side && n.alive);
  if (!nin.length) return false;
  const near = nin.find(n => Math.hypot(n.x - a.x, n.y - a.y) <= 80);
  if (!near) return false;
  const enemy = (1 - side) as Side;
  switch (j) {
    case 'rumor': { const u = S.units[a.unit!]; if (!u || !active(u) || u.side === side) return false; mHit(S, u, R.rumor, 'rumor'); u.noRegenUntil = t + R.rumorNoRegen; break; }
    case 'monomi': S.monomi.push({ side, x: a.x, y: a.y, until: t + 20 }); break;
    case 'gisei': { const u = S.units[a.unit!]; if (!u || u.side !== side) return false; u.fakeType = u.type === 'spear' ? 'archer' : 'spear'; u.fakeUntil = t + 60; break; }
    case 'sakuteki': for (const n of S.ninjas) if (n.side === enemy && n.alive && Math.hypot(n.x - near.x, n.y - near.y) <= 200) n.detUntil = t + 30; break;
    case 'ansatsu': {
      const u = S.units[a.unit!]; if (!u || u.side === side || !u.cmdAlive || u.type === 'general' || u.reinf) return false;
      const p = u.contacts.length ? R.assassinP : R.assassinPIdle;
      S.rec.nin[side].assTry++;
      if (S.rng() < p) { S.rec.nin[side].assKill++; cmdDeath(S, u, 'cmd', 'ansatsu'); }
      else if (R.assassinFailKills) { near.alive = false; fx(S, { k: 'ninjaDead', a: near.id, s: 'ansatsu' }); S.rec.nin[side].dead++; S.rec.nin[side].deadT.push(Math.round(t)); }
      else near.detUntil = t + 30;
      break;
    }
    case 'houka': { const p = S.points[a.point!]; if (!p || p.owner !== enemy) return false; p.burnedUntil = t + 60; aHit(S, enemy, R.houkaArmy, 'houka'); break; }
    case 'sennyu': { const u = S.units[a.unit!]; if (!u || u.side === side || !onField(u)) return false; addEff(S, u, 'shadow' + side, 60); break; }
    case 'kirigakure': S.smokes.push({ side, x: a.x, y: a.y, until: t + 30 }); break;
    case 'sahou': { const ph = S.phantoms[enemy] as any[]; ph.push({ x: a.x, y: a.y, until: t + 45 }, { x: clamp(a.x + 120, 20, 980), y: a.y, until: t + 45 }); break; }
    default: return false;
  }
  S.jutsuCd[side] = t + 90;
  fx(S, { k: 'jutsu', a: side, b: a.unit, n: a.point, s: j + (j === 'ansatsu' ? (S.units[a.unit!].cmdAlive ? ':fail' : ':ok') : '') });
  S.rec.jutsuUse[j] = (S.rec.jutsuUse[j] || 0) + 1;
  S.rec.nin[side].jutsu[j] = (S.rec.nin[side].jutsu[j] || 0) + 1;
  return true;
}

// ---------------- 戰鬥 ----------------
const dmgAcc: number[] = []; const atkBy: number[][] = []; const shinsaAcc: number[] = [];

export function damage(S: State, tg: Unit, dmg: number, src: Unit) {
  if (dmg <= 0) return;
  if (src.side !== tg.side) tg.lastHitBy = src.id;
  let m = 1;
  if (has(S, tg, 'dmg50')) m *= 0.5;
  if (tg.type === 'general' && passiveOn(tg, 'bishamon')) m *= 0.8;
  if (tg.retreating && passiveOn(tg, 'retreat30')) m *= 0.7;
  dmgAcc[tg.id] = (dmgAcc[tg.id] || 0) + dmg * m;
  if (has(S, src, 'shinsa')) shinsaAcc[tg.id] = (shinsaAcc[tg.id] || 0) + dmg * m;
  (atkBy[tg.id] ||= []).push(src.id);
}

function chargeOK(S: State, A: Unit, T: Unit, cA: number) {
  if (A.state === 'waver') return false;
  if (inMarsh(S, A.x, A.y)) return false;
  if (inWater(S, A.x, A.y) === 1) return false; // 涉水中無法衝鋒
  if (isCav(A) && T.type === 'spear' && cA === 0) return false; // 騎兵正面衝長槍無效
  if (has(S, T, 'koshu') && cA === 0) return false;              // 固守
  return true;
}

// 目前生效的大名令（S.meta.cmd 由 ai.ts 的 issueCommand 寫入；這裡只讀）
export function activeCmd(S: State, side: Side, kind: string, target?: number) {
  const c = (S.meta.cmd as ({ kind: string; until: number; target?: number } | null)[] | undefined)?.[side];
  return !!c && c.kind === kind && c.until > S.t && (target === undefined || c.target === target);
}
function chargeBonus(S: State, A: Unit) {
  const R = S.R; let c = UT[A.type].charge;
  if (R.cmdRaidCharge && isCav(A) && activeCmd(S, A.side, 'raid')) c += R.cmdRaidCharge; // 繞後令：騎兵衝鋒加成
  if (A.state === 'high') c += R.highCharge;
  if (passiveOn(A, 'charge4')) c += 4;
  if (has(S, A, 'charge15')) c += 15;
  if (has(S, A, 'kuruma')) c += 10;
  if (inPaddy(A.x, A.y)) c *= 0.5;
  return c;
}

function meleeAttack(S: State, A: Unit, T: Unit, nShare: number) {
  const R = S.R, t = S.t;
  const cA = cat(A, T);             // A 位於 T 的哪個方位（決定加成）
  const cT = cat(T, A);             // T 位於 A 的哪個方位（決定 A 能出手多少人）
  const face = (cA === 1 ? T.depth : T.width);
  let n = Math.min(nShare, 2 * face / 1.8 + 2);
  n *= cT === 0 ? 1 : cT === 1 ? 0.5 : 0.25;
  if (n <= 0) return;
  const BT = UT[A.type];
  let atk = BT.atk * meritMul(S, A);
  if (passiveOn(A, 'atk2')) atk += 2;
  if (A.chargeUntil > t && chargeOK(S, A, T, cA)) atk += chargeBonus(S, A);
  if (A.type === 'spear' && isCav(T)) atk += 12;
  let pct = 0;
  if (cA === 1 || cA === 2) {
    pct += cA === 1 ? 0.3 : 0.6;
    let extra = 0;
    if (has(S, A, 'kitsutsuki')) extra += 0.3;
    if (passiveOn(A, 'flank20')) extra += 0.2;
    pct += Math.min(extra, R.buffCapPct);
  }
  if (height(A.x, A.y) - height(T.x, T.y) >= 5) pct += 0.15;
  if (A.state === 'high') pct += R.highAtkPct; else if (A.state === 'waver') pct += R.waverAtkPct;
  let sk = 0;
  if (has(S, A, 'atk30')) sk += 0.3;
  if (has(S, A, 'kuruma')) sk += 0.25;
  pct += Math.min(sk, R.buffCapPct);
  if (A.type === 'spear' && A.form === 'dense' && isCav(T) && cT === 0) pct += 0.5; // 槍衾反擊
  let def = UT[T.type].def;
  if (T.state === 'rout' || T.state === 'shattered') def = 0;
  else {
    if (passiveOn(T, 'def2')) def += 2;
    if (T.form === 'dense') def += 3; else if (T.form === 'loose') def -= 3;
    if (has(S, T, 'koshu')) def += 5;
    if (has(S, T, 'furin') && T.contacts.length) def += 3;
  }
  const p = clamp(0.4 + (atk * (1 + pct) - def) * 0.03, 0.1, 0.9);
  const hits = poisson(S.rng, n / R.meleeInterval * S.dt * p);
  if (hits > 0) damage(S, T, hits * R.meleeDmg, A);
  // 車懸：被攻擊的敵軍額外士氣打擊（每次發動每個目標一次）
  const ku = A.eff.find(e => e.id === 'kuruma' && e.until > t);
  if (ku) { const k = ku.act + ':' + T.id; if (!S.kurumaHit.has(k)) { S.kurumaHit.add(k); mHit(S, T, R.kurumaExtra, 'kuruma'); } }
}

export function archerRange(S: State, A: Unit, T: Unit) {
  let r = (A.type === 'archer' ? S.R.archerRange : UT[A.type].range) + (passiveOn(A, 'range20') ? 20 : 0);
  if (height(A.x, A.y) - height(T.x, T.y) >= 5) r *= 1.2;
  return r;
}
export function canSee(S: State, side: Side, T: Unit) { return S.vis[side][T.id] >= 2 || T.contacts.some(c => S.units[c].side === side); }

function volley(S: State, A: Unit, T: Unit) {
  if (A.type === 'gun') return gunVolley(S, A, T);
  if (A.type === 'cannon') return cannonVolley(S, A, T);
  const d = dist(A, T);
  const RG = S.R.archerRange;
  let p = d <= 50 ? 0.35 : d <= RG ? 0.35 - (d - 50) / (RG - 50) * 0.2 : 0.15 * Math.max(0.3, 1 - (d - RG) / 60);
  if (inForest(T.x, T.y)) p *= 0.5;
  if (inWater(S, T.x, T.y) === 1) p *= S.R.waterArrow; // 水中行動遲緩，容易中箭
  if (T.form === 'loose') p *= 0.6; else if (T.form === 'dense') p *= 1.3;
  if (S.smokes.some(s => s.until > S.t && Math.hypot(T.x - s.x, T.y - s.y) <= 60)) p *= 0.5;
  if (S.R.cmdFocusHit !== 1 && activeCmd(S, A.side, 'focus', T.id)) p *= S.R.cmdFocusHit; // 集火令：齊射更密
  const hits = poisson(S.rng, A.men * p * meritMul(S, A));
  fx(S, { k: 'volley', a: A.id, b: T.id, n: hits });
  damage(S, T, hits * S.R.arrowDmg, A);
  mHit(S, T, S.R.volley, 'volley');
  if (S.R.cmdFocusMorale && activeCmd(S, A.side, 'focus', T.id)) mHit(S, T, S.R.cmdFocusMorale, 'focus'); // 集火令：集中箭雨的額外動搖
  T.lastArrowT = S.t;
  if (S.R.arrowSplash > 0) for (const X of S.units) { // 濺射：擠在目標旁邊的敵隊一起中箭
    if (X === T || X.side !== T.side || !active(X) || Math.hypot(X.x - T.x, X.y - T.y) > 15) continue;
    const h2 = poisson(S.rng, A.men * p * S.R.arrowSplash); if (h2 > 0) { damage(S, X, h2 * S.R.arrowDmg, A); mHit(S, X, S.R.volley * 0.5, 'volley'); X.lastArrowT = S.t; }
  }
  A.ammo--; A.reload = has(S, A, 'rapid') ? 3 : 6;
}

// 鐵砲齊射：60 m 內命中 50%、到射程邊 25%；森林與煙霧減半；每輪士氣 −3；裝填 15 秒（三段撃ち減半）
function gunVolley(S: State, A: Unit, T: Unit) {
  const R = S.R, d = dist(A, T), RG = UT.gun.range;
  const H = R.gunHit; let p = d <= 60 ? H : H - Math.min(1, (d - 60) / (RG - 60)) * H * 0.5;
  if (inForest(T.x, T.y)) p *= 0.5;
  if (T.form === 'loose') p *= 0.6; else if (T.form === 'dense') p *= 1.3;
  if (S.smokes.some(s => s.until > S.t && Math.hypot(T.x - s.x, T.y - s.y) <= 60)) p *= 0.5;
  const hits = poisson(S.rng, A.men * p * meritMul(S, A));
  fx(S, { k: 'volley', a: A.id, b: T.id, n: hits, s: 'gun' });
  damage(S, T, hits * R.gunDmg, A);
  mHit(S, T, R.gunVolley, 'gun');
  if (R.arrowSplash > 0) for (const X of S.units) { if (X === T || X.side !== T.side || !active(X) || Math.hypot(X.x - T.x, X.y - T.y) > 15) continue; const h2 = poisson(S.rng, A.men * p * R.arrowSplash); if (h2 > 0) damage(S, X, h2 * R.gunDmg, A); }
  T.lastArrowT = S.t;
  A.ammo--; A.reload = has(S, A, 'rapid') ? R.gunReload / 2 : R.gunReload;
}
// 大筒：60 m 內打不到；每發 1～3 彈、每彈 10 傷害；目標士氣 −8，30 m 內其他敵隊 −3（恐懼）；裝填 40 秒
function cannonVolley(S: State, A: Unit, T: Unit) {
  const R = S.R, d = dist(A, T);
  if (d < R.cannonMin) return;
  let lam = d < 150 ? R.cannonLam : R.cannonLam * 0.72; if (T.form === 'dense') lam *= 1.3; else if (T.form === 'loose') lam *= 0.7;
  const hits = poisson(S.rng, lam);
  fx(S, { k: 'volley', a: A.id, b: T.id, n: hits, s: 'cannon' });
  if (hits > 0) damage(S, T, hits * R.cannonDmg, A);
  mHit(S, T, R.cannonVolley, 'cannon');
  for (const X of S.units) if (X !== T && X.side === T.side && active(X) && dist(X, T) <= 30) { mHit(S, X, R.cannonTerror, 'cannon'); if (R.cannonSplash > 0 && dist(X, T) <= 20) { const h2 = poisson(S.rng, R.cannonSplash); if (h2 > 0) damage(S, X, h2 * R.cannonDmg, A); } }
  T.lastArrowT = S.t;
  A.ammo--; A.reload = R.cannonReload;
}

// ---------------- 移動 ----------------
function speedOf(S: State, u: Unit, running: boolean) {
  let v = UT[u.type].speed * (running ? 1 : 0.6);
  if (inMarsh(S, u.x, u.y)) v *= 0.4;
  else if (inPaddy(u.x, u.y)) v *= 0.7;
  const wt = inWater(S, u.x, u.y); if (wt === 1) v *= S.R.waterSpeed; else if (wt === 2) v *= S.R.fordSpeed;
  if (isCav(u) && inForest(u.x, u.y) && !onTrail(S, u.x, u.y)) v *= 0.6;
  if (S.R.crowdSlow > 0 && crowdN[u.id] >= 2) v *= 1 - S.R.crowdSlow; // 擁擠：20 m 內有 ≥2 支友軍（每步在 moveUnits 開頭算一次）
  if (has(S, u, 'speed20')) v *= 1.2;
  if (has(S, u, 'speed30')) v *= 1.3;
  if (has(S, u, 'slow30')) v *= 0.7;
  if (u.side === 1 && advisorPassive(S, 1, 'echigo') && u.contacts.length === 0) v *= 1.1;
  return v;
}

const crowdN: number[] = []; // 每隊 20 m 內的友軍數（每步重算）
function moveUnits(S: State) {
  const t = S.t, dt = S.dt;
  if (S.R.crowdSlow > 0) {
    const U = S.units; crowdN.length = U.length; crowdN.fill(0);
    for (let i = 0; i < U.length; i++) { const a = U[i]; if (a.state === 'gone') continue; const aa = active(a); for (let j = i + 1; j < U.length; j++) { const b = U[j]; if (b.side !== a.side || b.state === 'gone') continue; const dx = a.x - b.x, dy = a.y - b.y; if (dx * dx + dy * dy < 400) { const ab = active(b); if (ab) crowdN[i]++; if (aa) crowdN[j]++; } } }
  }
  for (const u of S.units) {
    if (u.state === 'gone') continue;
    if (u.state === 'rout' || u.state === 'shattered') {
      const edgeY = u.side === 0 ? -5 : 705;
      let nx = u.x;
      // 主將收容：潰兵往主將方向逃（主將在後方時）
      if (S.R.rallyNearGen > 0 && u.state === 'rout') {
        const g = general(S, u.side);
        if (g !== u && g.cmdAlive && active(g) && (u.side === 0 ? g.y < u.y : g.y > u.y)) nx = g.x;
      }
      let best = 1e9, ne: Unit | null = null;
      for (const v of S.units) if (v.side !== u.side && active(v)) { const d = dist(u, v); if (d < best) { best = d; ne = v; } }
      if (ne && best < 80) nx += Math.sign(u.x - ne.x || 1) * 40;
      const dx = nx - u.x, dy = edgeY - u.y, L = Math.hypot(dx, dy) || 1;
      const v = speedOf(S, u, true);
      u.x += dx / L * v * dt; u.y += dy / L * v * dt; u.f = Math.atan2(dy, dx);
      if (u.y < 0 || u.y > 700) {
        if (u.state === 'rout') S.rec.fled[u.side]++;
        u.state = 'gone';
      }
      continue;
    }
    const pinned = u.contacts.length > 0 && !u.retreating && u.disUntil <= t;
    if (pinned) {
      u.runDist = 0;
      let pr = S.units[u.primary];
      if (!pr || !u.contacts.includes(pr.id)) {
        pr = (u.target >= 0 && u.contacts.includes(u.target)) ? S.units[u.target] : S.units[u.contacts[0]];
        u.primary = pr.id;
      }
      const want = Math.atan2(pr.y - u.y, pr.x - u.x);
      const rate = (isCav(u) ? Math.PI / 2 : Math.PI / 4) * dt;
      const d = angDiff(want, u.f); u.f += clamp(d, -rate, rate);
      continue;
    }
    if (!u.hasDest) { u.runDist = 0; continue; }
    const dx = u.destX - u.x, dy = u.destY - u.y, L = Math.hypot(dx, dy);
    if (L < 1.5) { u.hasDest = false; u.runDist = 0; if (!Number.isNaN(u.finalF)) u.f = u.finalF; continue; }
    let v = speedOf(S, u, u.run);
    if (u.run && height(u.x + dx / L, u.y + dy / L) < height(u.x, u.y)) v *= 1.1;
    const s = Math.min(L, v * dt);
    u.x = clamp(u.x + dx / L * s, 2, 998); u.y = clamp(u.y + dy / L * s, 2, 698);
    u.f = Math.atan2(dy, dx);
    u.runDist = u.run ? u.runDist + s : 0;
  }
  // 友軍不重疊：沒接戰的部隊太靠近就互相推開（部隊不能疊在同一個點上）
  if (S.R.unitSeparation) {
    const A = S.units;
    for (let i = 0; i < A.length; i++) {
      const a = A[i]; if (!active(a) || a.contacts.length) continue;
      for (let j = i + 1; j < A.length; j++) {
        const b = A[j]; if (b.side !== a.side || !active(b) || b.contacts.length) continue;
        const minD = (a.rad + b.rad) * 0.9; let dx = b.x - a.x, dy = b.y - a.y; let d = Math.hypot(dx, dy);
        if (d >= minD) continue;
        if (d < 0.01) { dx = 1; dy = 0; d = 1; }
        const push = Math.min((minD - d) / 2, 2.5 * dt);
        a.x = clamp(a.x - dx / d * push, 2, 998); a.y = clamp(a.y - dy / d * push, 2, 698);
        b.x = clamp(b.x + dx / d * push, 2, 998); b.y = clamp(b.y + dy / d * push, 2, 698);
      }
    }
  }
  // 忍者
  for (const n of S.ninjas) {
    if (!n.alive) continue;
    const dx = n.tx - n.x, dy = n.ty - n.y, L = Math.hypot(dx, dy);
    if (L < 1) continue;
    const s = Math.min(L, (S.R.fogV2 ? S.R.v2NinSpeed : 6) * dt * (inMarsh(S, n.x, n.y) ? 0.5 : 1));
    n.x = clamp(n.x + dx / L * s, 2, 998); n.y = clamp(n.y + dy / L * s, 2, 698);
  }
}

// ---------------- 視野與情報 ----------------
function updateVision(S: State) {
  const R = S.R, t = S.t;
  for (const side of [0, 1] as Side[]) {
    const vis = S.vis[side];
    const obs: { x: number; y: number; V: number; nin: boolean; spot: number }[] = []; // spot：察覺半徑（識別半徑 × 倍數）
    const koga = S.clan[side] === 'koga';
    const v2 = R.fogV2;
    for (const u of S.units) if (u.side === side && u.state !== 'gone') {
      let V = v2 ? R.v2UnitSee : 200; if (height(u.x, u.y) >= 8) V *= 1.5; if (inForest(u.x, u.y)) V *= 0.5;
      obs.push({ x: u.x, y: u.y, V, nin: false, spot: V * (v2 ? R.v2UnitSpot / R.v2UnitSee : 1.5) });
    }
    if (R.ninjaOn) for (const n of S.ninjas) if (n.side === side && n.alive) {
      let V = (v2 ? R.v2NinSee : 250) * (koga ? S.R.kogaVision : 1); if (height(n.x, n.y) >= 8) V *= 1.5; if (inForest(n.x, n.y)) V *= 0.5;
      obs.push({ x: n.x, y: n.y, V, nin: true, spot: V * (v2 ? R.v2NinSpot / R.v2NinSee : 1.5) });
    }
    // v2 察覺距離是識別距離的倍數（部隊 1.6、忍者 1.7）；v1 固定 1.5
    // 已探索格：任一觀察者的察覺範圍掃過的格子
    // 已探索格：任一觀察者的察覺範圍掃過的格子（只掃觀察者外框內的格子，用平方距離）
    if (v2) {
      const ex = S.explored[side];
      for (const o of obs) {
        const r = o.spot, r2 = r * r;
        const cx0 = Math.max(0, Math.floor((o.x - r) / 25)), cx1 = Math.min(39, Math.floor((o.x + r) / 25)), cy0 = Math.max(0, Math.floor((o.y - r) / 25)), cy1 = Math.min(27, Math.floor((o.y + r) / 25));
        for (let cy = cy0; cy <= cy1; cy++) { const dy = cy * 25 + 12.5 - o.y, dy2 = dy * dy; for (let cx = cx0; cx <= cx1; cx++) { const i = cy * 40 + cx; if (ex[i]) continue; const dx = cx * 25 + 12.5 - o.x; if (dx * dx + dy2 <= r2) ex[i] = 1; } }
      }
    }
    for (const E of S.units) {
      if (E.side === side) continue;
      if (E.state === 'gone') { vis[E.id] = 0; continue; }
      if (!R.fogOn) { vis[E.id] = 3; continue; }
      let lvl = 0, see = false, insight = false;
      const smoked = S.smokes.some(s => s.side === E.side && s.until > t && Math.hypot(E.x - s.x, E.y - s.y) <= 60);
      const special = inAmbush(S, E.x, E.y) ? 40 : inForest(E.x, E.y) ? 60 : 1e9;
      for (const o of obs) {
        const det = Math.min(o.V, special);
        const d = Math.hypot(E.x - o.x, E.y - o.y);
        if (o.nin && d <= R.insightR) { insight = true; if (!v2) { lvl = 3; break; } }
        if (d <= det) { see = true; lvl = Math.max(lvl, v2 ? 1 : 2); } else if (d <= Math.min(o.spot, special * o.spot / o.V)) lvl = Math.max(lvl, 1);
      }
      const spotted = lvl >= 1;
      if (v2) {
        // 識別與洞悉要累積觀察時間；沒看到時慢慢遺忘
        let o = S.obs[side].get(E.id); if (!o) { o = { t2: 0, t3: 0 }; S.obs[side].set(E.id, o); }
        let im = 1; // 識別累積速度：三ツ者情報網（忍者 150 m 內 ×2）、對甲賀疑兵（÷1.5）
        if (R.clanPassive) { if (S.clan[side] === 'mitsumono' && S.ninjas.some(n => n.side === side && n.alive && Math.hypot(n.x - E.x, n.y - E.y) <= 150)) im *= 2; if (S.clan[E.side] === 'koga') im /= R.passiveGiheiMul; }
        o.t2 = see ? Math.min(o.t2 + S.dt * im, 60) : Math.max(0, o.t2 - S.dt); o.t3 = insight ? Math.min(o.t3 + S.dt, 60) : Math.max(0, o.t3 - S.dt);
        if (see && o.t2 >= R.v2IdentT) lvl = 2;
        if (insight && o.t3 >= R.v2InsightT) lvl = 3;
      }
      for (const m of S.monomi) if (m.side === side && m.until > t && Math.hypot(E.x - m.x, E.y - m.y) <= 150) lvl = 3;
      if (has(S, E, 'shadow' + side)) lvl = 3;
      if (smoked) lvl = Math.min(lvl, 1);
      if (E.contacts.some(c => S.units[c].side === side)) lvl = Math.max(lvl, 2);
      if (lvl < 1 && E.contacts.length) for (const o of obs) if (Math.hypot(E.x - o.x, E.y - o.y) <= 300) { lvl = 1; break; }
      if (v2) {
        // 記憶：最後看到的等級與位置；識別 40 秒後退為察覺、察覺 120 秒後遺忘（位置停在最後看到的地方）
        const m = S.mem[side].get(E.id);
        if (lvl >= 1) S.mem[side].set(E.id, { lvl: Math.max(lvl, 1), t, x: E.x, y: E.y });
        else if (m) {
          const age = t - m.t; let eff = m.lvl >= 2 ? (age > R.v2Decay2 ? 1 : 2) : 1;
          if (age > R.v2Decay1) eff = 0;
          if (eff > lvl) { lvl = eff; const nz = S.noisy[side].get(E.id); if (!nz || nz.t < m.t) S.noisy[side].set(E.id, { x: m.x + (S.rng() - 0.5) * 40, y: m.y + (S.rng() - 0.5) * 40, t: m.t }); }
        }
        if (lvl === 1 && spotted) { const nz = S.noisy[side].get(E.id); if (!nz || t - nz.t > 5) S.noisy[side].set(E.id, { x: E.x + (S.rng() - 0.5) * 60, y: E.y + (S.rng() - 0.5) * 60, t }); }
      } else if (lvl === 1) {
        const nz = S.noisy[side].get(E.id);
        if (!nz || t - nz.t > 5) S.noisy[side].set(E.id, { x: E.x + (S.rng() - 0.5) * 60, y: E.y + (S.rng() - 0.5) * 60, t });
      }
      vis[E.id] = lvl;
    }
    // 地形秘密
    const sr = v2 ? R.v2SecretR : 50;
    const ids: [string, { x: number; y: number }, number][] = [];
    S.secrets.marsh.forEach((m, i) => ids.push(['m' + i, m, MAP.marshR + sr]));
    S.secrets.ambush.forEach((m, i) => ids.push(['a' + i, m, MAP.ambushR + sr]));
    for (const [id, p, r] of ids) if (!S.known[side].has(id) && obs.some(o => Math.hypot(o.x - p.x, o.y - p.y) <= r)) { S.known[side].add(id); fx(S, { k: 'found', a: side, s: id }); }
    if (!S.known[side].has('trail') && obs.some(o => inForest(o.x, o.y) && Math.abs(o.x - S.secrets.trailX) <= (v2 ? 20 : 50))) { S.known[side].add('trail'); fx(S, { k: 'found', a: side, s: 'trail' }); }
  }
  // 忍者被發現
  if (R.ninjaOn) for (const n of S.ninjas) {
    if (!n.alive) continue;
    if (n.autoAt !== undefined && t >= n.autoAt) { n.manual = false; n.autoAt = undefined; }
    const enemy = (1 - n.side) as Side;
    let r = STEALTH_R[CLANS[S.clan[n.side]].stealth];
    if (S.clan[enemy] === 'nokizaru') r = Math.max(r, 60); // 草
    let seen = false;
    for (const u of S.units) if (u.side === enemy && active(u) && Math.hypot(u.x - n.x, u.y - n.y) <= r) { seen = true; break; }
    if (seen) {
      if (n.detUntil <= t && n.immuneUntil <= t) {
        if (S.clan[n.side] === 'iga' && S.rng() < 0.5) n.immuneUntil = t + 10;
        else { n.detUntil = t + 10; S.rec.nin[n.side].detected++; }
      } else if (n.detUntil > t) n.detUntil = Math.max(n.detUntil, t + 3);
    }
  }
}

// ---------------- 主迴圈 ----------------
export function step(S: State) {
  const R = S.R, t = S.t, dt = S.dt;
  // 效果到期
  for (const u of S.units) {
    if (!u.eff.length) continue;
    const keep: Effect[] = [];
    for (const e of u.eff) {
      if (e.until > t) keep.push(e);
      else if (e.id === 'atk30' && active(u)) mHit(S, u, R.kesshiEnd, 'kesshiEnd');
    }
    u.eff = keep;
    if (u.fakeUntil <= t) u.fakeType = null;
  }
  dmgAcc.length = 0; atkBy.length = 0; shinsaAcc.length = 0;
  S.smokes = S.smokes.filter(s => s.until > t); S.monomi = S.monomi.filter(s => s.until > t);
  if (R.clanPassive && R.ninjaOn) for (const s of [0, 1] as Side[]) { // 忍者眾自動特性
    const c = S.clan[s], e = (1 - s) as Side;
    if (c === 'iga') for (const p of S.points) if (p.owner === e && S.ninjas.some(n => n.side === s && n.alive && n.detUntil <= t && Math.hypot(n.x - p.x, n.y - p.y) <= 40)) p.burnedUntil = Math.max(p.burnedUntil, t + 1);
    if (c === 'nokizaru') for (const m of S.ninjas) if (m.side === e && m.alive && m.detUntil <= t && m.immuneUntil <= t && S.ninjas.some(n => n.side === s && n.alive && n.detUntil <= t && Math.hypot(n.x - m.x, n.y - m.y) <= R.passiveSakutekiR)) { m.detUntil = t + 10; m.immuneUntil = t + 10 + R.passiveSakutekiImmune; S.rec.nin[e].detected++; fx(S, { k: 'jutsu', a: s, s: 'sakuteki' }); }
  }
  // AI
  S.ai(S);
  // 移動
  moveUnits(S);
  // 接觸
  const U = S.units;
  for (const u of U) u.contacts = [];
  for (let i = 0; i < U.length; i++) {
    const a = U[i]; if (a.state === 'gone') continue;
    for (let j = i + 1; j < U.length; j++) {
      const b = U[j]; if (b.state === 'gone' || b.side === a.side) continue;
      if (Math.abs(a.x - b.x) > 40 || Math.abs(a.y - b.y) > 40) continue;
      if (dist(a, b) < a.rad + b.rad) { a.contacts.push(b.id); b.contacts.push(a.id); }
    }
  }
  // 接觸瞬間事件（側背、衝鋒）
  for (const A of U) {
    if (!fighting(A, t)) continue;
    for (const tid of A.contacts) {
      const T = U[tid]; const key = A.id * 1000 + T.id;
      const p = S.pairs.get(key);
      if (p && (t - p.last <= 2 || t - p.onset <= 15)) { p.last = t; continue; }
      S.pairs.set(key, { onset: t, last: t });
      if (!active(T)) continue;
      const cA = cat(A, T);
      if (inWater(S, T.x, T.y) === 1 && inWater(S, A.x, A.y) !== 1) { mHit(S, T, R.waterHit, 'water'); fx(S, { k: 'water', a: A.id, b: T.id, n: R.waterHit }); } // 半渡而擊：岸上打水中
      if (cA > 0 && !(cA === 1 && has(S, T, 'noFlankMorale'))) {
        let m = cA === 1 ? R.flank : R.rear;
        if (has(S, A, 'kitsutsuki')) m *= R.kitsutsukiMoraleMult;
        mHit(S, T, m, cA === 1 ? 'flank' : 'rear');
        fx(S, { k: cA === 1 ? 'flank' : 'rear', a: A.id, b: T.id, n: m });
      }
      if (A.run && A.runDist >= 25 && !chargeOK(S, A, T, cA)) fx(S, { k: 'blocked', a: A.id, b: T.id });
      if (A.run && A.runDist >= 25 && chargeOK(S, A, T, cA)) {
        A.chargeUntil = t + 8;
        fx(S, { k: 'charge', a: A.id, b: T.id, n: isCav(A) ? 1 : 0 });
        if (isCav(A)) {
          mHit(S, T, R.chargeHit, 'chargeHit');
          if (has(S, A, 'chargeShock')) mHit(S, T, R.akazonaeExtra, 'akazonae');
          if (R.cmdRaidShock && activeCmd(S, A.side, 'raid', T.id)) mHit(S, T, R.cmdRaidShock, 'raid'); // 繞後令指定的目標：額外震撼
        }
      }
    }
  }
  for (const u of U) if (u.contacts.length) u.runDist = 0;
  // 近戰（正面寬度上限：同一目標同時能被打的人數受其周長限制，多出來的攻擊者只能在後面等）
  const capScale = new Map<number, number>();
  if (R.frontageCap) {
    const want = new Map<number, number>();
    for (const A of U) {
      if (!fighting(A, t) || !A.contacts.length) continue;
      const front = Math.min(A.men, Math.ceil(A.men / A.ranks) * R.frontRanks);
      const share = front / A.contacts.length;
      for (const tid of A.contacts) { const T = U[tid]; const cT = cat(T, A); const face = cat(A, T) === 1 ? T.depth : T.width; const n = Math.min(share, 2 * face / 1.8 + 2) * (cT === 0 ? 1 : cT === 1 ? 0.5 : 0.25); want.set(tid, (want.get(tid) ?? 0) + n); }
    }
    for (const [tid, n] of want) { const T = U[tid]; if (T.state === 'rout' || T.state === 'shattered') continue; const cap = 2 * (T.width + T.depth) / 1.8 + 4; if (n > cap) capScale.set(tid, cap / n); }
  }
  for (const A of U) {
    if (!fighting(A, t) || !A.contacts.length) continue;
    const front = Math.min(A.men, Math.ceil(A.men / A.ranks) * R.frontRanks);
    const share = front / A.contacts.length;
    for (const tid of A.contacts) meleeAttack(S, A, U[tid], share * (capScale.get(tid) ?? 1));
  }
  // 遠程
  for (const A of U) {
    if (!isRanged(A)) continue;
    A.reload -= dt;
    if (!active(A) || A.contacts.length || A.retreating || A.ammo <= 0 || A.reload > 0) continue;
    const T = U[A.fireTarget];
    if (!T || T.state === 'gone' || T.side === A.side) continue;
    if (!canSee(S, A.side, T)) continue;
    if (dist(A, T) > archerRange(S, A, T)) continue;
    volley(S, A, T);
  }
  // 套用傷害
  for (const T of U) {
    const d = dmgAcc[T.id]; if (!d || T.state === 'gone') continue;
    T.hp -= d; T.lastDmgT = t;
    const mult = 1 + ((shinsaAcc[T.id] || 0) / d) * (R.shinsaMult - 1); // 只放大飯富本隊造成的傷亡
    if (T.hp <= 0) {
      T.hp = 0; T.men = 0;
      const killer = U[(atkBy[T.id] || [])[0]];
      if (T.cmdAlive) cmdDeath(S, T, 'cmd', 'wipe', killer);
      if (T.advAlive && !R.advisorEscape) cmdDeath(S, T, 'adv', 'wipe', killer);
      if (active(T)) { S.rec.wipes.push({ t, side: T.side, active: true }); rout(S, T, true); }
      else S.rec.wipes.push({ t, side: T.side, active: false });
      T.state = 'gone';
      continue;
    }
    T.men = Math.ceil(T.hp / T.hpPer - 1e-9);
    updDims(T);
    const steps = Math.floor((1 - T.men / T.men0) * 10 + 1e-9);
    while (T.lossSteps < steps) { T.lossSteps++; mHit(S, T, (T.lossSteps > R.lossEscAt ? R.lossStep2 : R.lossStep) * mult, 'losses'); }
  }
  // 持續性士氣
  const sec = Math.abs(t - Math.round(t)) < 1e-6;
  for (const u of U) {
    if (u.state === 'gone') continue;
    if (active(u) && u.contacts.length >= 2) {
      const dirs = new Set<number>();
      for (const c of u.contacts) { const A = U[c]; if (fighting(A, t)) { const c = cat(A, u); dirs.add(c === 1 ? (Math.sin(Math.atan2(A.y - u.y, A.x - u.x) - u.f) > 0 ? 11 : 12) : c); } }
      if (dirs.size >= R.surroundMinDirs) { mHit(S, u, R.surroundPerSec * dt, 'surround', false); fx(S, { k: 'surround', a: u.id }); }
    }
    if (!u.contacts.length && t >= u.noRegenUntil && u.morale < u.moraleStart) {
      let r = R.regenPer5s / 5;
      if (u.side === 0 && passiveOn(general(S, 0), 'hitowa')) r *= R.hitowaRegen;
      const b = u.morale; u.morale = Math.min(u.moraleStart, u.morale + r * dt);
      addRec(S.rec.uPos[u.side], 'regen', u.morale - b);
    }
    if (sec) {
      u.effHist.push(effM(S, u)); if (u.effHist.length > 12) u.effHist.shift();
      u.recent = u.recent.filter(e => t - e.t <= 10);
    }
  }
  // 每秒：討取武將判定、補給
  if (sec) {
    for (const u of U) {
      if (!onField(u) || u.state === 'gone') continue;
      if (R.cmdDeathOn && u.men < 0.25 * u.men0 && (u.cmdAlive || u.advAlive) && (!R.cmdKillOnlyRouting || u.state === 'rout' || u.state === 'shattered')) {
        for (const c of u.contacts) {
          const A = U[c]; if (!fighting(A, t)) continue;
          if (u.cmdAlive && S.rng() < R.cmdKillChance) cmdDeath(S, u, 'cmd', 'melee', A);
          if (u.advAlive && S.rng() < R.cmdKillChance) cmdDeath(S, u, 'adv', 'melee', A);
        }
      }
    }
    const sp = S.points[2];
    if (sp.owner >= 0 && sp.burnedUntil <= t) for (const u of U) {
      if (!isRanged(u) || u.side !== sp.owner || !active(u) || dist(u, sp) > 60) continue;
      u.supplyAcc += 1; if (u.supplyAcc >= 20) { u.supplyAcc = 0; u.ammo = Math.min(u.ammoMax, u.ammo + 1); }
    }
  }
  // 每 10 秒：軍勢牽動部隊士氣
  if (Math.abs(t / 10 - Math.round(t / 10)) < 1e-6 && t > 0) {
    for (const u of U) {
      if (!active(u)) continue;
      if (S.army[u.side] < R.armyLowThresh) mHit(S, u, R.armyLowPer10s, 'armyLow', false);
      else if (S.army[u.side] > R.armyHighThresh) mHit(S, u, R.armyHighPer10s, 'armyHigh', false);
    }
  }
  // 狀態轉換：潰逃與重整
  for (const u of U) {
    if (u.state === 'gone' || u.state === 'shattered') continue;
    const e = effM(S, u);
    if (u.state === 'rout') {
      let wait = passiveOn(u, 'nigedanjo') ? R.rallyWaitNige : R.rallyWait;
      const g = general(S, u.side);
      if (g.cmdAlive && active(g) && dist(u, g) <= R.genAuraR) wait /= 2;
      const genOk = R.rallyNearGen <= 0 || (g.cmdAlive && active(g) && dist(u, g) <= R.rallyNearGen);
      if (genOk && t - u.lastDmgT >= wait && e >= R.rallyAt) {
        u.state = 'waver'; u.retreating = true; u.hasDest = false;
        if (R.rallyCap > 0) { u.moraleStart = Math.min(u.moraleStart, R.rallyCap); u.morale = Math.min(u.morale, R.rallyCap); }
        fx(S, { k: 'rally', a: u.id });
        aHit(S, u.side, R.aRally, 'rally');
      }
    } else if (e < R.routAt && !has(S, u, 'shingari')) rout(S, u);
    else u.state = e >= R.highAt ? 'high' : e >= R.waverAt ? 'steady' : 'waver';
  }
  // 據點
  for (let i = 0; i < S.points.length; i++) {
    const p = S.points[i];
    const pres = [false, false]; let fast = [false, false];
    for (const u of U) if (active(u) && !u.retreating && dist(u, p) <= MAP.pointR) { pres[u.side] = true; if (passiveOn(u, 'cap12')) fast[u.side] = true; }
    if (pres[0] !== pres[1]) {
      const s: Side = pres[0] ? 0 : 1;
      if (p.owner !== s) {
        if (p.progSide !== s) { p.progSide = s; p.prog = 0; }
        p.prog += dt;
        if (p.prog >= (fast[s] ? 12 : 20)) {
          const prev = p.owner; p.owner = s; p.prog = 0; p.progSide = -1; p.ownSince = t;
          aHit(S, s, R.aPointGain, 'pointGain');
          if (prev >= 0) aHit(S, prev as Side, R.aPointLost, 'pointLost');
          if (p.id === 'village') S.reinfT[s] = t;
        }
      }
    }
  }
  for (const s of [0, 1] as Side[]) {
    if (S.points.every(p => p.owner === s)) S.holdAll[s] += dt; else S.holdAll[s] = 0;
    const v = S.points[0];
    if (v.owner === s && v.burnedUntil <= t && S.reinfUsed[s] < 2 && t - S.reinfT[s] >= 90) {
      S.reinfT[s] = t; S.reinfUsed[s]++;
      const ru = makeUnit(S, s, null, 'spear', 'reinf' + S.reinfUsed[s], 500, s === 0 ? 30 : 670);
      ru.role = 'reinf';
    }
  }
  // 視野
  if (Math.abs(t * 2 - Math.round(t * 2)) < 1e-6) updateVision(S);
  // 忍者被擊殺
  if (R.ninjaOn) for (const n of S.ninjas) {
    if (!n.alive) continue;
    if (n.detUntil > t && U.some(u => u.side !== n.side && active(u) && Math.hypot(u.x - n.x, u.y - n.y) <= 10)) {
      n.nearT += dt; if (n.nearT >= 3) { n.alive = false; fx(S, { k: 'ninjaDead', a: n.id, s: 'caught' }); S.rec.nin[n.side].dead++; S.rec.nin[n.side].deadT.push(Math.round(t)); }
    } else n.nearT = 0;
  }
  // 紀錄
  if (Math.abs(t / 5 - Math.round(t / 5)) < 1e-6 && t > 0) {
    for (const s of [0, 1] as Side[]) {
      const va = S.rec.visAcc[s];
      for (const E of U) if (E.side !== s && active(E)) { va.n++; const v = S.vis[s][E.id]; if (v >= 1) va.any1++; if (v >= 2) va.id2++; if (v >= 3) va.id3++; }
    }
  }
  if (Math.abs(t / 5 - Math.round(t / 5)) < 1e-6) S.rec.series.push([Math.round(t), +S.army[0].toFixed(1), +S.army[1].toFixed(1)]);
  // 勝負
  const col = [S.army[0] < R.collapseAt, S.army[1] < R.collapseAt];
  if (col[0] || col[1]) {
    const loser: Side = col[0] && col[1] ? (S.army[0] <= S.army[1] ? 0 : 1) : col[0] ? 0 : 1;
    S.over = { winner: (1 - loser) as Side, type: 'collapse', t };
  } else {
    for (const s of [0, 1] as Side[]) {
      const alive = U.some(u => u.side === s && (active(u) || u.state === 'rout'));
      if (!alive) { S.over = { winner: (1 - s) as Side, type: 'wipe', t }; break; }
      if (R.pointWin && S.holdAll[s] >= 60) { S.over = { winner: s, type: 'points', t }; break; }
    }
  }
  if (U.some(u => u.contacts.length)) S.lastContactT = t;
  if (!S.over && R.withdrawEnd > 0 && t > 300 && t - S.lastContactT >= R.withdrawEnd && Math.abs(S.army[0] - S.army[1]) >= 15) {
    S.over = { winner: S.army[0] > S.army[1] ? 0 : 1, type: 'withdraw', t }; // 退卻：久無接戰且軍勢差距明顯，落後方退出戰場
  }
  if (!S.over && t + dt >= 600) {
    const d = S.army[0] - S.army[1];
    S.over = { winner: Math.abs(d) < 0.5 ? -1 : d > 0 ? 0 : 1, type: 'time', t: 600 };
  }
  S.t = Math.round((t + dt) * 1000) / 1000;
}
