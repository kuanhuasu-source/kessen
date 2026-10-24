// 《決戰》士氣模擬器 — 雙方共用的 AI（普通難度：反應延遲約 1 秒，受戰爭迷霧限制）
import { UT, MAP, CLANS, STEALTH_R, ROSTER_T, ROSTER_U, STREAMS, isRangedType, type Side, type UType } from './data.ts';
import {
  type State, type Unit, type Ninja, makeUnit, dist, cat, clamp, active, fighting, has, isCav, isRanged, effM, general, archerRange,
  useSkill, useStrategy, battleCry, useJutsu, inForest, inPaddy, updDims, onField, mHit, streamYAt,
} from './sim.ts';

type SideAI = { posture: 'advance' | 'hold' | 'attack'; attackT: number; aggr: number; cavWing: 'W' | 'E';
  nextTac: number; nextStrat: number; nextNin: number; giseiDone: boolean;
  // 戰線式指揮（aiLine）：錨點（己方座標）、階段、各隊槽位
  ax: number; ayl: number; phase: 'form' | 'approach' | 'volley' | 'advance' | 'melee'; volleyUntil: number;
  ids: Record<string, number>; slots: Map<number, { x: number; yl: number }>; reserveId: number; rangedKeys: string[]; cavKeys: string[] };

// 大名模式：玩家在軍議定的方針（S.meta.doctrine[side]）、親自接管的部隊（S.meta.manual）、戰中的大名令（S.meta.cmd[side]）
export type Formation = 'line' | 'crane' | 'fish' | 'blob' | 'oblique' | 'stack'; // blob＝全軍擠成一團（量測用）、oblique＝斜線陣（右翼前伸、左翼後縮）
export type Doctrine = { attack: 'auto' | 'now' | 'volley' | 'waver' | 'hold'; cav: 'auto' | 'guard' | 'raid' | 'free'; retreatAt: number; formation: 'auto' | Formation };
export const DEFAULT_DOCTRINE: Doctrine = { attack: 'auto', cav: 'auto', retreatAt: 0, formation: 'auto' };
// 配置（S.meta.deployment[side]；S.meta.deploy 是佈陣紀錄字串，別撞名）：戰線順序（由左到右的部隊 key，3 或 4 隊）、預備隊、騎兵翼、各翼方針
export type Wing = 'hold' | 'steady' | 'press';
export type Deploy = { line: string[]; reserve: string | null; cavWing: 'W' | 'E'; wings: { L: Wing; C: Wing; R: Wing } };
export const DEFAULT_DEPLOY: Deploy = { line: ['spear1', 'samurai1', 'spear2'], reserve: null, cavWing: 'W', wings: { L: 'steady', C: 'steady', R: 'steady' } }; // 武田：三隊戰線（長槍 2、武士 1）
export function deployOf(S: State, s: Side): Deploy | null { return ((S.meta.deployment as (Deploy | null)[] | undefined)?.[s]) ?? null; }
// 開戰前套用配置：改戰線順序、預備隊、騎兵翼，並把部隊擺到對應的起始位置（只能在 t = 0 呼叫）
export function applyDeploy(S: State, s: Side, d: Deploy) {
  const A = (S.meta.ai as SideAI[])[s];
  const byKey = (k: string) => S.units.find(u => u.side === s && u.key === k);
  for (let i = 0; i < 4; i++) delete A.ids['line' + i];
  const B = MAP.base[s];
  const xs = (d.line.length === 3 ? [-60, 0, 60] : [-90, -30, 30, 90]).map(o => B.x + o);
  d.line.forEach((k, i) => { const u = byKey(k); if (!u) return; A.ids['line' + i] = u.id; u.role = 'line'; u.x = xs[i]; u.y = Yl(s, B.yl + S.R.deployFwd); u.holdX = u.x; u.holdY = u.y; });
  if (d.reserve) { const u = byKey(d.reserve); if (u) { A.reserveId = u.id; u.role = 'reserve'; u.x = B.x; u.y = Yl(s, B.yl - 35 + S.R.deployFwd); } } else A.reserveId = -1;
  A.cavWing = d.cavWing;
  A.cavKeys.forEach((k, i) => { const cav = byKey(k); if (!cav) return; const wingW = (d.cavWing === 'W') === (i === 0); cav.x = wingW ? 300 : 700; cav.y = Yl(s, 90); cav.role = wingW ? 'cav' : 'cap:supply'; });
  for (const u of S.units) if (u.side === s) { u.hasDest = false; u.destX = u.x; u.destY = u.y; }
}
export type CmdKind = 'charge' | 'regroup' | 'relieve' | 'focus' | 'commit' | 'raid';
export type Cmd = { kind: CmdKind; until: number; target?: number };
export const CMD_DUR: Record<CmdKind, number> = { charge: 30, regroup: 20, relieve: 25, focus: 20, commit: 30, raid: 25 };
export function doctrineOf(S: State, s: Side): Doctrine { return ((S.meta.doctrine as Doctrine[] | undefined)?.[s]) ?? DEFAULT_DOCTRINE; }
export function isManual(S: State, u: Unit) { return (S.meta.manual as Set<number> | undefined)?.has(u.id) ?? false; }
export function cmdOf(S: State, s: Side, kind?: CmdKind): Cmd | null {
  const c = (S.meta.cmd as (Cmd | null)[] | undefined)?.[s] ?? null;
  return c && c.until > S.t && (!kind || c.kind === kind) ? c : null;
}
// 下達大名令。relieve 的 target 是要支援的友軍，focus 的 target 是集火的敵軍。回傳是否成立
export function issueCommand(S: State, s: Side, kind: CmdKind, target?: number): boolean {
  const t = S.t;
  const A = (S.meta.ai as SideAI[])[s];
  const cmds = (S.meta.cmd as (Cmd | null)[] | undefined) ?? ((S.meta.cmd = [null, null]) as (Cmd | null)[]);
  const mine = S.units.filter(u => u.side === s && active(u) && !isManual(S, u));
  if (kind === 'regroup') {
    A.ayl = Math.max(60, A.ayl - 60);
    for (const u of mine) if (u.contacts.length && u.state === 'waver' && u.type !== 'general') u.retreating = true;
    if (S.R.cmdRegroupMorale) for (const u of mine) if (u.retreating || u.state === 'waver' || u.contacts.length) mHit(S, u, S.R.cmdRegroupMorale, 'regroup'); // 整頓令：穩住接戰中、動搖與撤退中的部隊
  } else if (kind === 'relieve') {
    const T = target !== undefined ? S.units[target] : null;
    if (!T || !T.contacts.length) return false;
    const cost = (u: Unit) => dist(u, T) * (u.type === 'cav' ? 0.6 : 1) * (u.role === 'reserve' ? 0.5 : 1); // 預備隊優先
    const helpers = mine.filter(u => u !== T && !u.contacts.length && !u.retreating && (u.type === 'spear' || u.type === 'samurai' || u.type === 'cav'))
      .sort((a, b) => cost(a) - cost(b)).slice(0, Math.max(1, S.R.cmdRelieveN));
    if (!helpers.length) return false;
    for (const helper of helpers) { helper.aiLockK = 'help:' + T.id; helper.aiLockT = t; }
  } else if (kind === 'focus' || kind === 'raid') {
    if (target === undefined) return false;
  } else if (kind === 'commit') {
    const g = general(S, s); if (!g.cmdAlive || !active(g)) return false;
    if (S.R.cmdCommitMorale) for (const u of mine) if (u !== g && dist(u, g) <= 80) mHit(S, u, S.R.cmdCommitMorale, 'commit');
  } else if (kind === 'charge') {
    if (S.R.cmdChargeMorale) for (const u of mine) mHit(S, u, S.R.cmdChargeMorale, 'charge');
  }
  cmds[s] = { kind, until: t + CMD_DUR[kind], target };
  return true;
}

const Yl = (side: Side, y: number) => side === 0 ? y : 700 - y; // 己方座標 → 絕對座標
// 各方對峙線（己方座標）：武田用規則 aiHoldYl（量測工具可調），上杉用地圖預設
export const holdYlOf = (S: State, s: Side) => s === 0 ? S.R.aiHoldYl : MAP.holdYl[1];
const fwd = (side: Side) => side === 0 ? 1 : -1;
const Q: Record<UType, number> = { spear: 1, archer: 0.8, samurai: 2.2, cav: 2.2, general: 2.5, gun: 1.0, cannon: 1.6 };
const CLS = (t: UType): 'spear' | 'archer' | 'samurai' | 'cav' | 'general' => isRangedType(t) ? 'archer' : t as 'spear' | 'samurai' | 'cav' | 'general'; // 目標偏好表：遠程兵種視同弓兵

// ---------------- 佈陣 ----------------
export function setup(S: State) {
  const rng = S.rng;
  const ai: [SideAI, SideAI] = ([0, 1] as Side[]).map(s => ({
    posture: 'advance', attackT: S.R.aiLine ? S.R.aiAttackT0 + rng() * S.R.aiAttackTR : 45 + rng() * 105, aggr: (0.8 + rng() * 0.4) * MAP.aggr[s], cavWing: rng() < 0.5 ? 'W' : 'E', // 戰線式：成線推進本身就要 1 分鐘，發起攻勢的時間提早
    nextTac: 0, nextStrat: 0, nextNin: 0, giseiDone: false,
    ax: MAP.base[s].x, ayl: MAP.base[s].yl + S.R.deployFwd, phase: 'form', volleyUntil: 0, ids: {}, slots: new Map(), reserveId: -1, rangedKeys: [], cavKeys: [],
  } as SideAI)) as [SideAI, SideAI];
  S.meta.ai = ai;
  // 戰線順序來自名單（長槍與武士）；四成機率把前兩隊對調
  const order: string[][] = [];
  for (const s of [0, 1] as Side[]) {
    const line = (s === 0 ? ROSTER_T : ROSTER_U).filter(r => r.type === 'spear' || r.type === 'samurai').map(r => r.key);
    if (rng() < 0.4 && line.length >= 2) { const t = line[0]; line[0] = line[1]; line[1] = t; }
    order[s] = line;
  }
  // 情報力高的一方可以看到對方佈陣再應對（雙方都高時各自隨機）
  const intel = (s: Side) => !S.R.ninjaOn || !S.R.ninjaSides[s] ? 'low' : S.clan[s] === 'nokizaru' ? S.R.nokizaruIntel : CLANS[S.clan[s]].intel;
  for (const s of [0, 1] as Side[]) {
    const e = (1 - s) as Side;
    if (S.R.counterDeploy && S.R.fogOn && !S.R.fogV2 && intel(s) === 'high' && intel(e) !== 'high') { // v2：開戰看不到敵方佈陣，不做針對性佈陣
      ai[s].cavWing = ai[e].cavWing === 'W' ? 'E' : 'W';
      if (ai[e].cavWing === 'W') order[s].reverse();
    }
  }
  S.meta.deploy = order.map((o, s) => o.join(',') + '|' + ai[s].cavWing);
  for (const s of [0, 1] as Side[]) {
    const roster = s === 0 ? ROSTER_T : ROSTER_U;
    const R = (k: string) => roster.find(r => r.key === k)!;
    const F = S.R.deployFwd, B = MAP.base[s];
    const mk = (k: string, x: number, yl: number) => makeUnit(S, s, R(k), R(k).type, k, clamp(x, 40, 960), Yl(s, yl + F));
    mk('gen', B.x, B.yl - 70).role = 'general';
    const n = order[s].length; const xs = (n === 3 ? [-60, 0, 60] : [-90, -30, 30, 90]).map(o => B.x + o);
    order[s].forEach((k, i) => { const u = mk(k, xs[i], B.yl); u.role = 'line'; });
    const ranged = roster.filter(r => isRangedType(r.type)).map(r => r.key);
    ranged.forEach((k, i) => { mk(k, B.x + (i - (ranged.length - 1) / 2) * 110, B.yl - 40).role = 'archer'; });
    const cavs = roster.filter(r => r.type === 'cav').map(r => r.key);
    cavs.forEach((k, i) => { const wingW = (ai[s].cavWing === 'W') === (i === 0); mk(k, wingW ? B.x - 200 : B.x + 200, B.yl - 20).role = 'cav'; });
    for (const u of S.units) if (u.side === s) ai[s].ids[u.key] = u.id;
    order[s].forEach((k, i) => { ai[s].ids['line' + i] = ai[s].ids[k]; });
    ai[s].rangedKeys = ranged; ai[s].cavKeys = cavs;
  }
  S.meta.tenkyu = S.units.find(u => u.side === 0 && u.key === 'samurai1');
  // 別働隊：開戰時不在場（state gone、away），抵達時間寫在 S.meta.detachAt
  if (S.R.detachOn) {
    const D = MAP.detach; S.meta.detachAt = S.R.detachT0 + rng() * S.R.detachTR; S.meta.detachDone = false;
    for (const u of S.units) if (u.side === D.side && D.keys.includes(u.key)) { u.away = true; u.state = 'gone'; u.x = D.entry.x; u.y = D.entry.y + 60; }
  }
  // 據點分派：西端的長槍取村落、另一隊長槍取寺廟；騎兵先取自己那一翼的據點
  for (const s of [0, 1] as Side[]) {
    const mine = S.units.filter(u => u.side === s);
    const spears = mine.filter(u => u.type === 'spear').sort((a, b) => a.x - b.x);
    if (!S.R.aiLine) { spears[0].role = 'cap:village'; spears[1].role = 'cap:temple'; } // 戰線式：據點由戰線推進順路佔領
    for (const cav of mine.filter(u => u.type === 'cav')) cav.role = cav.x > 500 ? 'cap:supply' : 'cav'; // 東翼的騎兵先去佔補給點
    // 伏兵：知道己方半場的伏兵處時，有一半機率派西側的武士埋伏
    const myAmb = S.secrets.ambush.map((a, i) => ({ a, i })).filter(o => S.known[s].has('a' + o.i) && (s === 0 ? o.a.y < 350 : o.a.y > 350));
    if (S.R.fogOn && myAmb.length && rng() < 0.5) {
      const sam = mine.filter(u => u.type === 'samurai').sort((a, b) => a.x - b.x)[0];
      sam.role = 'ambush'; sam.holdX = myAmb[0].a.x; sam.holdY = myAmb[0].a.y;
    }
  }
  // 忍者
  if (S.R.ninjaOn) for (const s of [0, 1] as Side[]) {
    if (!S.R.ninjaSides[s]) continue;
    const c = CLANS[S.clan[s]];
    const roles = ['scoutW', 'scoutE', 'shadow', 'rear', 'shadow'];
    for (let i = 0; i < c.n; i++) S.ninjas.push({ id: S.ninjas.length, side: s, x: MAP.base[s].x + (i - 2) * 10, y: Yl(s, MAP.base[s].yl + S.R.ninjaFwd), alive: true,
      detUntil: -1, immuneUntil: -1, nearT: 0, role: roles[i], tx: MAP.base[s].x, ty: Yl(s, MAP.base[s].yl + S.R.ninjaFwd), fleeUntil: -1 });
  }
  S.ai = tick;
}

// ---------------- 情報判讀 ----------------
function vis(S: State, s: Side, E: Unit) { return S.vis[s][E.id]; }
function seenPos(S: State, s: Side, E: Unit) {
  if (vis(S, s, E) >= 2) return { x: E.x, y: E.y };
  const n = S.noisy[s].get(E.id); return n ? { x: n.x, y: n.y } : { x: E.x, y: E.y };
}
function pType(S: State, s: Side, E: Unit): UType { return E.fakeType && E.fakeUntil > S.t && vis(S, s, E) < 3 ? E.fakeType : E.type; }
function pMorale(S: State, s: Side, E: Unit) {
  const v = vis(S, s, E);
  if (v >= 3) return effM(S, E);
  if (v === 2) return E.state === 'high' ? 90 : E.state === 'steady' ? 65 : E.state === 'waver' ? 37 : 10;
  return 65;
}
function known(S: State, s: Side) { return S.units.filter(E => E.side !== s && onField(E) && vis(S, s, E) >= 1); }

// ---------------- 主 tick ----------------
function tick(S: State) {
  const t = S.t;
  const ai = S.meta.ai as [SideAI, SideAI];
  // 遊戲中：S.meta.aiSides 指定由 AI 指揮的一方；玩家那一方只有「自動」狀態的忍者由 AI 移動（不施放忍術）
  const sides = (S.meta.aiSides as Side[] | undefined) ?? [0, 1];
  for (const s of [0, 1] as Side[]) {
    const A = ai[s];
    const full = sides.includes(s);
    if (full && t >= A.nextStrat) { A.nextStrat = t + 5; strategic(S, s, A); }
    if (full && t >= A.nextTac) { A.nextTac = t + 1; tactical(S, s, A); }
    if (S.R.ninjaOn && t >= A.nextNin) { A.nextNin = t + 1; ninjaAI(S, s, A, full && S.meta.playerSide !== s); } // 大名模式：忍術仍由玩家施放
  }
}

function strength(S: State, s: Side, view: Side) {
  let str = 0;
  for (const u of S.units) {
    if (u.side !== s || !onField(u) || u.state === 'shattered') continue;
    if (u.state === 'rout') continue;
    if (view !== s) {
      const v = vis(S, view, u);
      const men = v >= 3 ? u.men : u.men0;
      const st = v >= 2 ? (u.state === 'waver' ? 0.7 : 1) : 1;
      str += men * Q[pType(S, view, u)] * st;
    } else str += u.men * Q[u.type] * (u.state === 'waver' ? 0.7 : u.state === 'high' ? 1.1 : 1);
  }
  return str;
}

function strategic(S: State, s: Side, A: SideAI) {
  const t = S.t, e = (1 - s) as Side;
  if (t < 25) { A.posture = 'advance'; return; }
  const ratio = strength(S, s, s) / Math.max(1, strength(S, e, s));
  const g = general(S, s);
  const enemyArmy = g.advAlive ? S.army[e] : (S.army[e] > 66 ? 85 : S.army[e] > 33 ? 50 : 25);
  // 大名令優先：全軍突擊＝攻勢、全軍整頓＝守勢
  if (cmdOf(S, s, 'charge')) { A.posture = 'attack'; return; }
  if (cmdOf(S, s, 'regroup')) { A.posture = 'hold'; return; }
  const D = doctrineOf(S, s);
  if (D.attack !== 'auto') {
    const mine = S.units.filter(u => u.side === s && active(u));
    const arch = mine.filter(u => isRanged(u));
    const spent = !arch.length || arch.every(u => u.ammo <= u.ammoMax * 0.5);
    const enemyWaver = known(S, s).some(E => vis(S, s, E) >= 2 && (E.state === 'waver' || E.state === 'rout'));
    const late = t > 300 && S.army[s] <= enemyArmy;
    if (D.attack === 'now') A.posture = 'attack';
    else if (D.attack === 'volley') A.posture = spent || t > 180 || ratio >= 1.3 || late ? 'attack' : 'hold';
    else if (D.attack === 'waver') A.posture = enemyWaver || t > 240 || ratio >= 1.3 || late ? 'attack' : 'hold';
    else A.posture = t > 420 || enemyArmy < 40 ? 'attack' : 'hold'; // hold：守住寺廟前的線
    return;
  }
  if (t >= A.attackT / A.aggr || ratio >= 1.15 / A.aggr || (t > 300 && S.army[s] <= enemyArmy) || t > 420) A.posture = 'attack';
  else A.posture = 'hold';
  if (A.posture === 'attack' && ratio < 0.55 && S.army[s] > enemyArmy + 10 && t < 540) A.posture = 'hold';
}

// ---------------- 戰術 ----------------
function targetScore(S: State, u: Unit, E: Unit): number {
  const s = u.side;
  const p = seenPos(S, s, E);
  const d = Math.hypot(p.x - u.x, p.y - u.y);
  const pt = pType(S, s, E);
  const routing = E.state === 'rout' || E.state === 'shattered';
  let sc = -d / 100;
  type C5 = 'spear' | 'archer' | 'samurai' | 'cav' | 'general';
  const pref: Record<C5, Record<C5, number>> = {
    samurai: { archer: 1.0, spear: 0.6, samurai: 0.3, cav: -0.5, general: 0.5 },
    spear: { cav: 1.2, general: 1.0, samurai: 0.2, spear: 0.3, archer: 0.6 },
    cav: { archer: 1.5, general: 0.8, samurai: 0.3, spear: -1.5, cav: 0.5 },
    general: { archer: 0.8, spear: 0.2, samurai: 0.4, cav: 0.4, general: 0.6 },
    archer: { archer: 0.5, spear: 0.5, samurai: 0.5, cav: 0.5, general: 0.5 },
  };
  sc += pref[CLS(u.type)][CLS(pt)];
  const m = pMorale(S, s, E);
  sc += (100 - m) / 50;                                   // 優先攻擊士氣最低的敵軍
  if (E.contacts.some(c => S.units[c].side === s)) sc += 1.0; // 圍攻已接戰的敵人
  if (cat(u, E) > 0 && vis(S, s, E) >= 2) sc += 0.8;     // 可從側背接近
  if (routing) sc += isCav(u) ? 0.5 : -3;
  if (E.retreating) sc += isCav(u) ? 0.3 : -1.5;
  if (isCav(u) && pt === 'spear' && !E.contacts.length) sc -= 2;
  const maxD = isCav(u) ? 450 : 260;
  if (d > maxD) sc -= 5;
  if (S.R.aiSteady && !isCav(u)) {
    sc -= Math.abs(p.x - u.x) / 200; // 步兵優先打正前方，少斜穿戰線
    // 路線上有友軍擋著（會穿過自己人）就扣分
    for (const v of S.units) {
      if (v.side !== s || v === u || !active(v)) continue;
      const vx = p.x - u.x, vy = p.y - u.y, L2 = vx * vx + vy * vy || 1;
      const k = ((v.x - u.x) * vx + (v.y - u.y) * vy) / L2;
      if (k > 0.15 && k < 0.85 && Math.hypot(u.x + vx * k - v.x, u.y + vy * k - v.y) < 22) { sc -= 1.2; break; }
    }
  }
  return sc;
}

function pickTarget(S: State, u: Unit): Unit | null {
  const t = S.t;
  const cur = S.units[u.target];
  const cand = known(S, u.side).filter(E => E.state !== 'gone');
  if (!cand.length) return null;
  let best: Unit | null = null, bs = -1e9;
  for (const E of cand) { const sc = targetScore(S, u, E); if (sc > bs) { bs = sc; best = E; } }
  if (cur && onField(cur) && vis(S, u.side, cur) >= 1 && cur.state !== 'gone') {
    if (S.R.aiSteady) {
      // 止抖：目標鎖 8 秒；之後也要明顯更好（+1.5）才換，目標潰走或撤退才立刻換
      const alive = cur.state !== 'rout' && cur.state !== 'shattered' && !cur.retreating;
      const cs = targetScore(S, u, cur);
      if (alive && cs > -4 && (t - u.targetT < 8 || cs >= bs - 1.5)) return cur;
    } else if (t - u.targetT < 3 && targetScore(S, u, cur) >= bs - 0.5) return cur;
  }
  if (bs < -4) return null;
  if (best && best.id !== u.target) { u.target = best.id; u.targetT = t; }
  return best;
}

function moveTo(u: Unit, x: number, y: number, run = false) {
  u.destX = clamp(x, 5, 995); u.destY = clamp(y, 5, 695); u.hasDest = true; u.run = run;
}

function lineCentroid(S: State, s: Side) {
  let x = 0, y = 0, n = 0;
  for (const u of S.units) if (u.side === s && active(u) && !u.retreating && (u.type === 'spear' || u.type === 'samurai')) { x += u.x; y += u.y; n++; }
  return n ? { x: x / n, y: y / n } : null;
}

function nearestEnemyCav(S: State, u: Unit, r: number) {
  let best: Unit | null = null, bd = r;
  for (const E of known(S, u.side)) {
    if (!active(E) || !isCav(E) || vis(S, u.side, E) < 2) continue;
    if (pType(S, u.side, E) !== E.type && pType(S, u.side, E) !== 'cav') continue;
    const d = dist(u, E); if (d < bd) { bd = d; best = E; }
  }
  return best;
}

function tactical(S: State, s: Side, A: SideAI) {
  const t = S.t, R = S.R, e = (1 - s) as Side;
  const mine = S.units.filter(u => u.side === s && active(u));
  const g = general(S, s);
  const gActive = g.cmdAlive && active(g);
  let engagedCount = 0;
  for (const u of mine) if (u.contacts.length) engagedCount++;
  if (R.aiLine) lineAI(S, s, A);
  // 軍略
  if (R.strategyOn && g.advAlive && active(g)) {
    if (g.strategy === 'kitsutsuki') {
      const flankers = mine.filter(u => u.contacts.some(c => cat(u, S.units[c]) > 0)).length;
      const cavAttacking = mine.some(u => u.type === 'cav' && u.target >= 0 && dist(u, S.units[u.target]) < 150);
      if (engagedCount >= 3 && (flankers >= 1 || cavAttacking)) useStrategy(S, s);
    } else if (engagedCount >= 3) useStrategy(S, s);
  }
  const D = doctrineOf(S, s);
  for (const u of mine) {
    if (isManual(S, u)) continue; // 大名親自指揮的部隊，AI 不碰
    // 動搖單位的命令延遲（每 2 秒才更新一次）
    if (u.state === 'waver' && Math.round(t) % 2 === 1) continue;
    const eff = effM(S, u);
    // 鬨聲
    if (u.contacts.length && (eff < 65 || u.contacts.some(c => S.units[c].state === 'waver'))) battleCry(S, u);
    // 武將技
    skillAI(S, u, eff);
    // 有序撤退：動搖、接戰中、附近沒有大將
    const nearGen = gActive && dist(u, g) <= R.genAuraR;
    if (R.aiRetreat && !u.retreating && u.contacts.length && eff < R.waverAt && !nearGen && !has(S, u, 'shingari') && u.type !== 'general') {
      u.retreating = true;
    }
    // 軍議定的撤退線：士氣低於此值就脫離接戰退到主將旁
    if (D.retreatAt > 0 && !u.retreating && u.contacts.length && eff < D.retreatAt && !has(S, u, 'shingari') && u.type !== 'general') u.retreating = true;
    if (u.retreating) {
      if (eff >= 65 && !u.contacts.length) { u.retreating = false; }
      else {
        const tx = gActive ? g.x : u.x, ty = gActive ? g.y - fwd(s) * 30 : Yl(s, MAP.base[s].yl - 70);
        moveTo(u, tx, ty, true);
        continue;
      }
    }
    // 陣型
    if (u.type === 'spear') {
      const cv = nearestEnemyCav(S, u, S.R.aiSteady && u.form === 'dense' ? 170 : 120);
      if (cv && !has(S, u, 'noFlankMorale')) { if (u.form !== 'dense') { u.form = 'dense'; updDims(u); } }
      else if (u.form !== 'line' && !has(S, u, 'noFlankMorale')) { u.form = 'line'; updDims(u); }
    } else if (isRanged(u) && u.type !== 'cannon') {
      const want = t - u.lastArrowT < 8 ? 'loose' : 'line';
      if (u.form !== want) { u.form = want; updDims(u); }
    }
    // 追殺被發現的忍者
    if (u.huntNinja >= 0) {
      const n = S.ninjas[u.huntNinja];
      if (n && n.alive && n.detUntil > t && !u.contacts.length) { moveTo(u, n.x, n.y, true); continue; }
      u.huntNinja = -1;
    }
    if (!u.contacts.length && (u.type === 'cav' || u.role === 'general' ? false : true)) {
      // 一般部隊：附近 60 m 內有被發現的忍者時順手追殺
    }
    switch (u.type) {
      case 'archer': case 'gun': case 'cannon': archerAI(S, u, A); break;
      case 'cav': cavAI(S, u, A); break;
      case 'general': generalAI(S, u, A); break;
      default: infantryAI(S, u, A); break;
    }
  }
  // 忍者獵殺分派
  if (R.ninjaOn) for (const n of S.ninjas) {
    if (n.side === s || !n.alive || n.detUntil <= t) continue;
    if (mine.some(u => u.huntNinja === n.id)) continue;
    let best: Unit | null = null, bd = 120;
    for (const u of mine) {
      if (u.contacts.length || u.retreating || u.type === 'general' || u.role === 'ambush') continue;
      const d = Math.hypot(u.x - n.x, u.y - n.y) * (isCav(u) ? 0.6 : 1);
      if (d < bd) { bd = d; best = u; }
    }
    if (best) best.huntNinja = n.id;
  }
  // 詐報產生的假目標：守勢時派閒置長槍查看
  const ph = S.phantoms[s] as { x: number; y: number; until: number }[];
  S.phantoms[s] = ph.filter(p => p.until > t && !mine.some(u => Math.hypot(u.x - p.x, u.y - p.y) <= 40)) as any;
  void e;
}

function holdPos(S: State, u: Unit) {
  // 前線預設位置（寺廟前方）
  const s = u.side;
  const B = MAP.base[s]; const xs: Record<string, number> = { spear1: B.x - 70, samurai1: B.x - 30, samurai2: B.x + 30, spear2: B.x + 70 };
  const x = xs[u.key] ?? u.x;
  return { x, y: Yl(s, holdYlOf(S, s) + 5) };
}

function infantryAI(S: State, u: Unit, A: SideAI) {
  const t = S.t, s = u.side;
  if (u.contacts.length) return; // 接戰中：鎖定
  // 據點任務
  if (u.role.startsWith('cap:')) {
    const pid = u.role.slice(4);
    const p = S.points.find(q => q.id === pid)!;
    // 戰線式：佔到了、或全線轉入攻勢而自己離據點還遠，就歸隊
    if (S.R.aiLine && (p.owner === s || (A.posture === 'attack' && dist(u, p) > 60 && S.holdAll[1 - s] <= 0))) { u.role = 'line'; }
    else if (p.owner !== s || p.progSide === (1 - s)) {
      // 途中遇到敵人時就近迎擊
      const E = pickTarget(S, u);
      if (E && dist(u, E) < 70 && E.state !== 'rout') { attackMove(S, u, E); return; }
      moveTo(u, p.x, p.y + (s === 0 ? -10 : 10), dist(u, p) > 150 && t < 60);
      return;
    }
    if (pid === 'temple' || A.posture !== 'attack') {
      const E = pickTarget(S, u);
      if (E && dist(u, E) < 90 && E.state !== 'rout') { attackMove(S, u, E); return; }
      moveTo(u, p.x, p.y + (s === 0 ? -15 : 15));
      return;
    }
    // 村落已佔領且轉入攻勢 → 加入主戰線
  }
  if (u.role === 'ambush') {
    const E = pickTarget(S, u);
    if (E && dist(u, E) < 80 && E.state !== 'rout') { u.role = 'line'; attackMove(S, u, E); return; }
    if (t > 240) u.role = 'line';
    moveTo(u, u.holdX, u.holdY, t < 90);
    return;
  }
  if (S.R.aiLine && u.role === 'line') { lineInfantry(S, u, A); return; }
  if (S.R.aiLine && u.role === 'reserve') { reserveAI(S, u, A); return; }
  // 假目標
  const ph = S.phantoms[s] as { x: number; y: number; until: number }[];
  if (u.type === 'spear' && A.posture === 'hold' && ph.length) {
    const p = ph.find(q => Math.hypot(q.x - u.x, q.y - u.y) < 250);
    if (p) { moveTo(u, p.x, p.y); return; }
  }
  // 長槍：攔截威脅弓兵或大將的敵騎兵
  if (u.type === 'spear') {
    const cv = nearestEnemyCav(S, u, 220);
    if (cv) {
      const prot = S.units.filter(v => v.side === s && active(v) && (isRanged(v) || v.type === 'general'))
        .sort((a, b) => dist(a, cv) - dist(b, cv))[0];
      if (prot && dist(prot, cv) < 200) { moveTo(u, (prot.x * 2 + cv.x) / 3, (prot.y * 2 + cv.y) / 3, true); return; }
    }
  }
  if (A.posture === 'advance') { const h = holdPos(S, u); moveTo(u, h.x, h.y); return; }
  const E = pickTarget(S, u);
  if (A.posture === 'hold') {
    if (S.R.aiSteady && u.aiLockK === 'atk') {
      const T = S.units[u.target];
      if (T && active(T) && T.state !== 'rout' && !T.retreating && dist(u, T) < 150 && vis(S, s, T) >= 1) { attackMove(S, u, T); return; }
      u.aiLockK = '';
    }
    if (E && dist(u, E) < 90 && E.state !== 'rout' && !E.retreating) { u.aiLockK = 'atk'; attackMove(S, u, E); return; }
    const h = holdPos(S, u); moveTo(u, h.x, h.y); return;
  }
  if (E) attackMove(S, u, E);
  else { const h = holdPos(S, u); moveTo(u, h.x, h.y + fwd(s) * 80); }
}

function attackMove(S: State, u: Unit, E: Unit, run = false) {
  const p = seenPos(S, u.side, E);
  const d = Math.hypot(p.x - u.x, p.y - u.y);
  u.target = E.id;
  moveTo(u, p.x, p.y, (run || d < 70) && u.state !== 'waver');
}

function archerAI(S: State, u: Unit, A: SideAI) {
  const s = u.side, t = S.t;
  if (u.contacts.length) return;
  // 選擇射擊目標
  let best: Unit | null = null, bs = -1e9;
  const rng = archerRange(S, u, u);
  const minR = u.type === 'cannon' ? S.R.cannonMin : 0;
  for (const E of known(S, s)) {
    if (vis(S, s, E) < 2 || E.state === 'gone') continue;
    const d = dist(u, E); if (d > rng * 1.2 || d < minR) continue;
    let sc = -d / 150 + (100 - pMorale(S, s, E)) / 60;
    if (E.contacts.some(c => S.units[c].side === s)) sc += 0.6;
    if (inForest(E.x, E.y)) sc -= 0.8;
    if (E.state === 'rout' || E.state === 'shattered') sc -= 2;
    if (sc > bs) { bs = sc; best = E; }
  }
  // 大名令「集中弓火」：集火目標在射程內就優先
  const fc = cmdOf(S, s, 'focus');
  if (fc && fc.target !== undefined) { const F = S.units[fc.target]; if (F && active(F) && vis(S, s, F) >= 2 && dist(u, F) <= rng * 1.2) best = F; }
  u.fireTarget = best ? best.id : -1;
  // 敵騎兵逼近 → 後撤靠近長槍或大將
  const steady = S.R.aiSteady;
  const cv = nearestEnemyCav(S, u, 120);
  if ((cv && !cv.contacts.length) || (steady && u.aiLockK === 'cv' && t - u.aiLockT < 6)) {
    if (steady) { if (u.aiLockK !== 'cv' || t - u.aiLockT >= 6) { u.aiLockK = 'cv'; u.aiLockT = t; } else return; } // 已在後撤途中就不改路
    const prot = S.units.filter(v => v.side === s && active(v) && (v.type === 'spear' || v.type === 'general') && v !== u)
      .sort((a, b) => dist(a, u) - dist(b, u))[0];
    if (prot) { moveTo(u, prot.x, prot.y - fwd(s) * 25, true); return; }
    moveTo(u, u.x, u.y - fwd(s) * 60, true); return;
  }
  if (steady && u.aiLockK === 'cv') u.aiLockK = '';
  if (S.R.aiLine) { const sl = A.slots.get(u.id); if (sl) { moveTo(u, sl.x, Yl(s, sl.yl)); return; } } // 戰線式：守在線後的槽位，不追目標
  if (A.posture === 'advance' || A.posture === 'hold') {
    moveTo(u, A.ax + (A.rangedKeys.indexOf(u.key) - (A.rangedKeys.length - 1) / 2) * 90, Yl(s, holdYlOf(S, s) - 35)); return;
  }
  // 攻勢：跟在主戰線後方，保持射距（止抖：80～160 m 不動、每 3 秒才重新決定）
  if (steady && u.hasDest && t - u.aiLockT < 3) return;
  const tg = best ?? pickTarget(S, u);
  if (tg) {
    const p = seenPos(S, s, tg);
    const d = Math.hypot(p.x - u.x, p.y - u.y);
    const far = steady ? 160 : 130, want = steady ? 125 : 115;
    if (d > far) { moveTo(u, u.x + (p.x - u.x) * (d - want) / d, u.y + (p.y - u.y) * (d - want) / d); u.aiLockT = t; }
    else if (d < 80) { moveTo(u, u.x - (p.x - u.x) * 0.3, u.y - (p.y - u.y) * 0.3); u.aiLockT = t; }
    else u.hasDest = false;
  } else {
    const c = lineCentroid(S, s);
    if (c) moveTo(u, c.x + (A.rangedKeys.indexOf(u.key) - (A.rangedKeys.length - 1) / 2) * 60, c.y - fwd(s) * 60);
  }
  void t;
}

function cavAI(S: State, u: Unit, A: SideAI) {
  const t = S.t, s = u.side;
  // 衝鋒循環：接戰 10 秒仍未擊潰目標 → 脫離再衝
  if (u.contacts.length) {
    if (u.cavPhase !== 'melee') { u.cavPhase = 'melee'; u.cavPhaseT = t; }
    const tg = S.units[u.contacts[0]];
    const stuck = t - u.cavPhaseT > 10 && tg && active(tg) && u.men > 0.3 * u.men0;
    const bad = u.contacts.some(c => S.units[c].type === 'spear' && cat(u, S.units[c]) === 0) && t - u.cavPhaseT > 3;
    // 被包圍：兩隊以上接戰、或有人打到側背、或已動搖 → 3 秒後就脫離（不受 25 秒止抖限制）
    const surrounded = S.R.cavEscape && t - u.cavPhaseT > 1 && (u.contacts.length >= 2 || u.contacts.some(c => cat(S.units[c], u) !== 0) || u.state === 'waver' || (u.morale < 60 && u.men < 0.7 * u.men0));
    if (surrounded || ((stuck || bad) && u.state !== 'waver' && !(S.R.aiSteady && t - u.aiLockT < 25))) {
      u.cavPhase = 'withdraw'; u.cavPhaseT = t; u.disUntil = t + 6; u.aiLockT = t; u.targetT = t; // 止抖：退衝至少隔 25 秒，退開後仍打同一目標
      let ax = 0, ay = 0;
      for (const c of u.contacts) { const v = S.units[c]; const dx = u.x - v.x, dy = u.y - v.y, L = Math.hypot(dx, dy) || 1; ax += dx / L; ay += dy / L; }
      if (!surrounded || Math.hypot(ax, ay) < 0.3) { ax = u.x - tg.x; ay = u.y - tg.y; }
      const L = Math.hypot(ax, ay) || 1, far = surrounded ? 110 : 80;
      moveTo(u, u.x + ax / L * far, u.y + ay / L * far - fwd(s) * 20, true);
    }
    return;
  }
  if (u.cavPhase === 'withdraw' && t - u.cavPhaseT < 8) return;
  u.cavPhase = 'idle';
  // 先取己方一翼的據點
  if (u.role === 'cap:supply' || u.role === 'cap:village') {
    const p = S.points.find(q => q.id === u.role.slice(4))!;
    if (p.owner !== s && t < 150) {
      const E = pickTarget(S, u);
      if (E && dist(u, E) < 60) { cavAttack(S, u, E); return; }
      moveTo(u, p.x, p.y, false); return;
    }
    u.role = 'cav';
  }
  if (S.R.aiLine) {
    // 戰線式：接戰前守在翼側槽位，只迎擊逼近的敵騎兵／弓兵／潰兵；主線接戰後才繞翼
    // 騎兵方針：guard 只護翼不出擊；raid 主線接戰後繞翼（預設）；free 一轉攻勢就自由獵殺。全軍突擊時視同 free
    const Dc = doctrineOf(S, s).cav;
    const sl = A.slots.get(u.id)!;
    const E = pickTarget(S, u);
    const threat = E && dist(u, E) < 130 && (isCav(E) || isRanged(E) || E.state === 'rout');
    const rc = cmdOf(S, s, 'raid');
    if (rc && rc.target !== undefined) { const T = S.units[rc.target]; if (T && active(T) && T.state !== 'gone') { cavAttack(S, u, T); return; } }
    const passive = (S.R.daimyoPassive || S.R.daimyoPassiveCav) && S.meta.playerSide === s; // 大名模式：騎兵繞後要靠大名令（free 仍自由獵殺）
    const loose = cmdOf(S, s, 'charge') || (Dc === 'free' && A.posture === 'attack') || (Dc !== 'guard' && !passive && A.phase === 'melee');
    if (!E || (!loose && !threat) || (S.R.cavEscape && u.morale < 60 && !threat)) { moveTo(u, sl.x, Yl(s, sl.yl), false); return; } // 士氣未回到 60 不再出擊，回槽位休整
    cavAttack(S, u, E); return;
  }
  if (A.posture === 'advance') { moveTo(u, clamp(A.ax + (A.cavWing === 'W' ? -180 : 190), 40, 960), Yl(s, holdYlOf(S, s) - 80)); return; }
  const E = pickTarget(S, u);
  if (!E || (A.posture === 'hold' && dist(u, E) > 160 && !(isRanged(E) || E.state === 'rout'))) {
    moveTo(u, clamp(A.ax + (A.cavWing === 'W' ? -180 : 190), 40, 960), Yl(s, holdYlOf(S, s) - 50)); return;
  }
  cavAttack(S, u, E);
}

function cavAttack(S: State, u: Unit, E: Unit) {
  const s = u.side;
  const p = seenPos(S, s, E);
  u.target = E.id;
  // 目標的背後點
  const rx = p.x - Math.cos(E.f) * 35, ry = p.y - Math.sin(E.f) * 35;
  const dRear = Math.hypot(rx - u.x, ry - u.y);
  const dE = Math.hypot(p.x - u.x, p.y - u.y);
  if (dE < 45 || dRear < 25) { moveTo(u, p.x, p.y, true); return; }
  // 路線上若有未接戰的敵長槍，繞翼
  let blocked = false;
  for (const X of known(S, s)) {
    if (X === E || !active(X) || pType(S, s, X) !== 'spear' || X.contacts.length) continue;
    const q = seenPos(S, s, X);
    const vx = rx - u.x, vy = ry - u.y, L2 = vx * vx + vy * vy || 1;
    const k = clamp(((q.x - u.x) * vx + (q.y - u.y) * vy) / L2, 0, 1);
    if (Math.hypot(u.x + vx * k - q.x, u.y + vy * k - q.y) < 45) { blocked = true; break; }
  }
  let wx = rx, wy = ry;
  if (blocked) { wx = p.x + (u.x < p.x ? -110 : 110); wy = p.y; }
  // 騎兵避開森林（除非知道林間小徑）與稻田
  if (inForest(wx, wy) && !S.known[s].has('trail')) wx = Math.max(wx, 275);
  if (inPaddy(wx, wy)) wx = wx < 740 ? 635 : 845;
  moveTo(u, wx, wy, true);
}

function generalAI(S: State, u: Unit, A: SideAI) {
  const t = S.t, s = u.side, e = (1 - s) as Side;
  if (u.contacts.length) return;
  const steady = S.R.aiSteady;
  const lockOn = (k: string) => steady && u.aiLockK.startsWith(k) && t - u.aiLockT < (k === 'c:' ? 10 : k === 'w:' ? 8 : 6);
  const lock = (k: string) => { u.aiLockK = k; u.aiLockT = t; };
  // 大名令「主將親征」：打 220 m 內看得到的敵軍，動搖者優先
  if (cmdOf(S, s, 'commit') && effM(S, u) >= 40) {
    const E = known(S, s).filter(x => active(x) && vis(S, s, x) >= 2 && dist(u, x) < 220)
      .sort((a, b) => ((a.state === 'waver' || a.state === 'rout' ? 0 : 100) + dist(a, u)) - ((b.state === 'waver' || b.state === 'rout' ? 0 : 100) + dist(b, u)))[0];
    if (E) { attackMove(S, u, E, true); return; }
  }
  // 止抖：已鎖定的親征目標，只要還在動搖／潰走且在 160 m 內就追到底
  if (lockOn('c:')) {
    const E = S.units[+u.aiLockK.slice(2)];
    if (E && active(E) && (E.state === 'waver' || E.state === 'rout') && vis(S, s, E) >= 1 && dist(u, E) < 160) { attackMove(S, u, E); return; }
    u.aiLockK = '';
  }
  const cv = nearestEnemyCav(S, u, 150);
  if ((cv && !cv.contacts.length) || lockOn('cv')) {
    if (steady && !lockOn('cv')) lock('cv');
    const sp = S.units.filter(v => v.side === s && active(v) && v.type === 'spear').sort((a, b) => dist(a, u) - dist(b, u))[0];
    if (sp) { moveTo(u, sp.x, sp.y - (S.units[sp.id].side === 0 ? 20 : -20), true); return; }
  }
  const c = lineCentroid(S, s);
  if (!c) { moveTo(u, 500, Yl(s, 60)); return; }
  // 偏向最弱的接戰友軍（止抖：鎖 8 秒，期間該隊仍在接戰就不換）
  let weak: Unit | null = null, wm = 101;
  if (lockOn('w:')) { const v = S.units[+u.aiLockK.slice(2)]; if (v && active(v) && v.contacts.length) { weak = v; wm = effM(S, v); } }
  if (!weak) {
    for (const v of S.units) if (v.side === s && active(v) && v.contacts.length && v !== u) { const m = effM(S, v); if (m < wm) { wm = m; weak = v; } }
    if (weak && wm < 70 && steady) lock('w:' + weak.id);
  }
  const back = S.R.aiGenBack;
  let tx = c.x, ty = c.y - (s === 0 ? back : -back);
  if (S.R.aiLine) { const sl = A.slots.get(u.id); if (sl) { tx = sl.x; ty = Yl(s, sl.yl); } }
  if (weak && wm < 70) { tx = weak.x; ty = weak.y - (s === 0 ? Math.min(45, back) : -Math.min(45, back)); }
  // 主將親征：附近有動搖或潰走的敵軍、且沒有未接戰的敵長槍擋路 → 衝上去
  if (S.R.aiGenCommit && u.state !== 'waver' && effM(S, u) >= 60) {
    const E = known(S, s).filter(x => (x.state === 'waver' || x.state === 'rout') && vis(S, s, x) >= 2 && dist(u, x) < 120)
      .sort((a, b) => dist(a, u) - dist(b, u))[0];
    const spearNear = E && known(S, s).some(X => X !== E && active(X) && pType(S, s, X) === 'spear' && !X.contacts.length && dist(X, E) < 50);
    if (E && !spearNear) { if (steady) lock('c:' + E.id); attackMove(S, u, E); return; }
  }
  // 止抖：目的地只差一點就不改（避免每秒微調造成抖動）
  if (steady && u.hasDest && Math.hypot(u.destX - tx, u.destY - ty) < 12) return;
  // 勝勢時投入
  const enemyArmy = u.advAlive ? S.army[e] : (S.army[e] > 66 ? 85 : S.army[e] > 33 ? 50 : 25);
  if (A.posture === 'attack' && (enemyArmy < 40 || S.army[s] - enemyArmy > 35)) {
    const E = known(S, s).filter(x => (x.state === 'waver' || x.state === 'rout') && vis(S, s, x) >= 2 && dist(u, x) < 150)
      .sort((a, b) => dist(a, u) - dist(b, u))[0];
    if (E) { attackMove(S, u, E); return; }
  }
  moveTo(u, tx, ty, false);
  void t;
}

// ---------------- 戰線式指揮（aiLine） ----------------
// 整條線以同一個錨點推進：4 隊步兵有固定槽位，弓兵在線後 45 m，主將在中央後方，騎兵在翼側。
// 階段：form（就定位）→ approach（逼近）→ volley（進入射程邊停 20 秒讓弓兵齊射）→ advance（全線推進）→ melee（接戰，錨點跟著接戰的部隊）。
function formationOf(S: State, s: Side): Formation {
  const d = doctrineOf(S, s).formation;
  if (d !== 'auto') return d;
  const f = S.R.aiFormation;
  return f === 'crane' || (f === 'craneT' && s === 0) || (f === 'craneU' && s === 1) ? 'crane' : 'line';
}
const FORM_OFFS: Record<Formation, number[][]> = {
  line: [[-80, 0], [-27, 0], [27, 0], [80, 0]],
  crane: [[-115, 30], [-40, 0], [40, 0], [115, 30]],   // 鶴翼：兩翼前伸
  fish: [[-80, -25], [-27, 12], [27, 12], [80, -25]],   // 魚鱗：中央突出
  blob: [[-16, 8], [-6, -6], [6, 6], [16, -8]],         // 一團
  stack: [[0, 0], [0, 0], [0, 0], [0, 0]],              // 全部疊在同一點（量測用）
  oblique: [[-110, -30], [-45, -10], [20, 10], [85, 30]], // 斜線：右翼前伸
};
const FORM_OFFS3: Record<Formation, number[][]> = { // 三隊成線（有預備隊時）
  line: [[-55, 0], [0, 0], [55, 0]], crane: [[-95, 25], [0, 0], [95, 25]], fish: [[-55, -20], [0, 15], [55, -20]],
  blob: [[-12, 6], [0, -6], [12, 6]], oblique: [[-80, -25], [0, 0], [70, 25]], stack: [[0, 0], [0, 0], [0, 0]],
};
const WING_Y: Record<Wing, number> = { hold: -15, steady: 0, press: 20 }; // 各翼方針：猛攻前伸、固守後縮
function wingOf(A: SideAI, i: number, n: number): 'L' | 'C' | 'R' { return i === 0 ? 'L' : i === n - 1 ? 'R' : 'C'; }
function wingDoctrine(S: State, s: Side, A: SideAI, u: Unit): Wing {
  const d = deployOf(S, s); if (!d) return 'steady';
  const n = d.line.length; const i = [0, 1, 2, 3].find(k => A.ids['line' + k] === u.id);
  return i === undefined ? 'steady' : d.wings[wingOf(A, i, n)];
}
function lineAI(S: State, s: Side, A: SideAI) {
  const t = S.t, e = (1 - s) as Side, R = S.R;
  const mine = S.units.filter(u => u.side === s && active(u) && !u.reinf && !isManual(S, u));
  const lineUnits = mine.filter(u => u.role === 'line');
  const engaged = lineUnits.filter(u => u.contacts.length);
  // 敵線估計（己方座標）：看得到的敵軍（弓兵除外）中最靠近我方的第 2 隊，避免被單一突出的部隊誤導
  const ens = S.units.filter(E => E.side === e && onField(E) && active(E) && vis(S, s, E) >= 1 && !isRangedType(pType(S, s, E)))
    .map(E => { const p = seenPos(S, s, E); return { yl: Yl(s, p.y), x: p.x }; }).filter(o => Math.abs(o.x - A.ax) < 320).sort((a, b) => a.yl - b.yl);
  const frontYl = ens.length ? ens[Math.min(1, ens.length - 1)].yl : 999;
  const HL = holdYlOf(S, s);
  // aiHunt：攻勢的錨點目標是看得到的敵軍（離錨點最近的 3 隊平均，含背後），不是場地盡頭
  let huntYl = 700;
  if (R.aiHunt) {
    const all = S.units.filter(E => E.side === e && onField(E) && active(E) && E.state !== 'rout' && vis(S, s, E) >= 1).map(E => Yl(s, seenPos(S, s, E).y)).sort((a, b) => Math.abs(a - A.ayl) - Math.abs(b - A.ayl)).slice(0, 3);
    if (all.length) huntYl = clamp(all.reduce((a, b) => a + b, 0) / all.length, 40, 680);
  }
  let targetYl = A.posture === 'advance' ? HL : A.posture === 'hold' ? Math.max(A.ayl, HL) : huntYl; // hold：推進到對峙線就停，不再前進（之前寫成 min 會卡在半路）
  if (engaged.length) {
    A.phase = 'melee';
    const m = engaged.reduce((a, u) => a + Yl(s, u.y), 0) / engaged.length;
    A.ayl += clamp(m - A.ayl, -3, 3); targetYl = A.ayl;
  } else if (A.posture === 'attack') {
    const gap = frontYl - A.ayl;
    const archersReady = mine.some(u => isRanged(u) && u.ammo >= 3);
    const shooting = mine.some(u => isRanged(u) && t - u.lastArrowT < 12); // 對峙時已經在射就不必再停下齊射
    if (A.phase !== 'volley' && A.phase !== 'advance' && gap <= R.archerRange - 30 && archersReady && !shooting && doctrineOf(S, s).attack !== 'now' && !cmdOf(S, s, 'charge')) { A.phase = 'volley'; A.volleyUntil = t + R.aiVolleyDur; }
    else if (A.phase !== 'volley' && A.phase !== 'advance' && gap <= R.archerRange - 30 && shooting) A.phase = 'advance';
    if (A.phase === 'volley') { if (t < A.volleyUntil && gap > 60) targetYl = A.ayl; else A.phase = 'advance'; }
    else if (A.phase !== 'advance') A.phase = 'approach';
  } else A.phase = A.posture === 'advance' ? 'form' : 'approach';
  // 錨點以最慢者的速度推進（每秒呼叫一次），有人落後 45 m 以上就等
  if (!engaged.length) {
    const spd = R.aiAnchorSpd;
    const lag = lineUnits.some(u => !u.retreating && Yl(s, u.y) < A.ayl - 45);
    if (targetYl > A.ayl) { if (!lag) A.ayl = Math.min(targetYl, A.ayl + spd); }
    else if (targetYl < A.ayl) A.ayl = Math.max(targetYl, A.ayl - spd);
    // 橫向慢慢對準敵線中心
    if (ens.length) { const cx = ens.slice(0, 4).reduce((a, o) => a + o.x, 0) / Math.min(4, ens.length); A.ax = clamp(A.ax + clamp(cx - A.ax, -2, 2), 200, 800); }
  }
  // 溪流：前方 110 m 內有溪就對準最近的渡口，過溪時隊形收攏
  let squeeze = 1;
  if (R.streams !== 'none') for (const st of STREAMS[R.streams] ?? []) {
    const sy = streamYAt(S, A.ax); if (sy === null) continue; const syl = Yl(s, sy);
    if (syl > A.ayl - 25 && syl < A.ayl + 110 && !engaged.length) {
      const f = [...st.fords].sort((a, b) => Math.abs(a.x - A.ax) - Math.abs(b.x - A.ax))[0];
      if (f) A.ax = clamp(A.ax + clamp(f.x - A.ax, -3, 3), 60, 940);
      if (Math.abs(syl - A.ayl) < 40) squeeze = 0.35;
    }
  }
  // 槽位
  const d = deployOf(S, s);
  const n = A.ids.line3 === undefined ? 3 : 4;
  const offs = (n === 3 ? FORM_OFFS3 : FORM_OFFS)[formationOf(S, s)];
  A.slots.clear();
  for (let i = 0; i < n; i++) {
    const id = A.ids['line' + i]; if (id === undefined) continue;
    const wy = d ? WING_Y[d.wings[wingOf(A, i, n)]] : 0;
    A.slots.set(id, { x: A.ax + offs[i][0] * squeeze, yl: A.ayl + offs[i][1] + wy });
  }
  if (A.reserveId >= 0) A.slots.set(A.reserveId, { x: A.ax, yl: A.ayl - 35 });
  const fm = formationOf(S, s); const nr = A.rangedKeys.length;
  if (fm === 'stack') { for (const k of [...A.rangedKeys, 'gen', ...A.cavKeys]) A.slots.set(A.ids[k], { x: A.ax, yl: A.ayl }); }
  else if (fm === 'blob') { // 一團：遠程、主將、騎兵都擠在裡面
    A.rangedKeys.forEach((k, i) => A.slots.set(A.ids[k], { x: A.ax + (i - (nr - 1) / 2) * 28, yl: A.ayl - 20 }));
    A.slots.set(A.ids.gen, { x: A.ax, yl: A.ayl - 12 });
    A.cavKeys.forEach((k, i) => A.slots.set(A.ids[k], { x: A.ax + (i ? -32 : 32), yl: A.ayl - 6 }));
  } else {
    // 遠程在線後 45 m（大筒再退 15 m，打得遠也怕被衝）
    A.rangedKeys.forEach((k, i) => { const u = S.units[A.ids[k]]; A.slots.set(A.ids[k], { x: A.ax + (i - (nr - 1) / 2) * 90, yl: A.ayl - (u?.type === 'cannon' ? 60 : 45) }); });
    A.slots.set(A.ids.gen, { x: A.ax, yl: A.ayl - R.aiGenBack });
    A.cavKeys.forEach((k, i) => { const wingW = (A.cavWing === 'W') === (i === 0); A.slots.set(A.ids[k], { x: clamp(A.ax + (wingW ? -230 : 230), 60, 940), yl: A.ayl - 10 }); });
  }
  // 據點：守勢時派槽位 170 m 內、附近沒有敵軍的步兵去佔；敵軍握有全部據點時不計姿態，派最近的部隊去搶回
  const busy = mine.some(u => u.role.startsWith('cap:') && u.type !== 'cav');
  const threat = S.holdAll[e] > 0;
  if (!busy && (A.posture === 'hold' || threat)) {
    for (const p of S.points) {
      if (p.owner === s) continue;
      if (!threat && known(S, s).some(E => active(E) && dist(E, p) < 100)) continue;
      const ends = threat ? lineUnits : lineUnits.filter(u => u.id === A.ids.line0 || u.id === A.ids.line3); // 只派兩端的部隊，戰線中間不開洞
      const cand = ends.filter(u => !u.contacts.length && !u.retreating).map(u => ({ u, d: dist(u, p) })).filter(o => threat || o.d < 140).sort((a, b) => a.d - b.d)[0];
      if (cand) { cand.u.role = 'cap:' + p.id; break; }
    }
  }
}
// 戰線上的步兵：打正前方的敵人；沒有對手而鄰隊在打時，側擊鄰隊的對手；否則守槽位
function lineInfantry(S: State, u: Unit, A: SideAI) {
  const s = u.side;
  const sl = A.slots.get(u.id);
  if (!sl) { const h = holdPos(S, u); moveTo(u, h.x, h.y); return; }
  const sx = sl.x, sy = Yl(s, sl.yl);
  // 大名令「馳援」：去打被支援友軍的對手（從側背）
  if (u.aiLockK.startsWith('help:')) {
    const F = S.units[+u.aiLockK.slice(5)];
    const X = F && F.contacts.length ? S.units[F.primary >= 0 && F.contacts.includes(F.primary) ? F.primary : F.contacts[0]] : null;
    if (X && active(X) && S.t - u.aiLockT < CMD_DUR.relieve) { flankMove(S, u, X); return; }
    u.aiLockK = '';
  }
  const charge = !!cmdOf(S, s, 'charge');
  const wing = wingDoctrine(S, s, A, u);
  // 現有目標還在正前方附近就繼續（止抖）
  const cur = S.units[u.target];
  if (u.aiLockK === 'atk' && cur && active(cur) && cur.state !== 'rout' && !cur.retreating && vis(S, s, cur) >= 1 && dist(u, cur) < (charge ? 200 : 110)) { attackMove(S, u, cur, charge); return; }
  u.aiLockK = '';
  const ahead = (charge ? 220 : A.phase === 'melee' ? 90 : A.posture === 'hold' ? 70 : 60) + (wing === 'press' ? 40 : wing === 'hold' ? -20 : 0);
  const lat = charge ? 160 : wing === 'press' ? 100 : 75;
  const hunt = S.R.aiHunt && A.posture === 'attack' && S.t - S.lastContactT > 20; // 脫離接戰一陣子：任何方向 250 m 內都迎擊
  let best: Unit | null = null, bd = 1e9;
  for (const E of known(S, s)) {
    if (!active(E) || E.state === 'rout' || E.retreating) continue;
    const p = seenPos(S, s, E);
    const dy = Yl(s, p.y) - sl.yl;
    if (hunt) { if (Math.hypot(p.x - u.x, p.y - u.y) > 250) continue; }
    else if (Math.abs(p.x - sx) > lat || dy < -25 || dy > ahead) continue;
    const d = Math.hypot(p.x - u.x, p.y - u.y); if (d < bd) { bd = d; best = E; }
  }
  if (best) { u.aiLockK = 'atk'; u.target = best.id; u.targetT = S.t; attackMove(S, u, best, charge || wing === 'press'); return; }
  // 擴大戰果：鄰隊在打、自己空手 → 從側背接近鄰隊的對手（大名模式 daimyoPassive：玩家方不自動做，要靠「馳援」）
  if (A.phase === 'melee' && !(S.R.daimyoPassive && S.meta.playerSide === s)) {
    const engagedN = S.units.filter(v => v.side === s && active(v) && v.contacts.length).length;
    let X: Unit | null = null, xd = S.t > 240 ? 180 : (S.R.aiFlankReact && engagedN >= 2 ? 200 : 120); // 打久了或敵軍集中突破時放寬
    for (const E of known(S, s)) {
      if (!active(E) || E.state === 'rout' || !E.contacts.some(c => S.units[c].side === s)) continue;
      const d = dist(u, E); if (d < xd) { xd = d; X = E; }
    }
    if (X) { u.aiLockK = 'atk'; flankMove(S, u, X); return; }
  }
  moveTo(u, sx, sy, S.R.aiFormRun && A.phase === 'form'); // 成線階段可用跑的（急行軍到對峙線）
}
// 預備隊（二番備）：站在戰線中央後方；友軍動搖（士氣 < 55）或大名令馳援時出動打其對手，事後回到預備位置
function reserveAI(S: State, u: Unit, A: SideAI) {
  const s = u.side, t = S.t;
  const sl = A.slots.get(u.id);
  if (u.aiLockK.startsWith('help:')) {
    const F = S.units[+u.aiLockK.slice(5)];
    const X = F && F.contacts.length ? S.units[F.primary >= 0 && F.contacts.includes(F.primary) ? F.primary : F.contacts[0]] : null;
    if (X && active(X) && t - u.aiLockT < CMD_DUR.relieve) { flankMove(S, u, X); return; }
    u.aiLockK = '';
  }
  const cur = S.units[u.target];
  if (u.aiLockK === 'atk' && cur && active(cur) && cur.state !== 'rout' && dist(u, cur) < 110) { attackMove(S, u, cur); return; }
  u.aiLockK = '';
  if (A.phase === 'melee' || cmdOf(S, s, 'charge')) {
    let F: Unit | null = null, fm = 55;
    for (const v of S.units) if (v.side === s && v !== u && active(v) && v.contacts.length && !isManual(S, v)) { const m = effM(S, v); if (m < fm) { fm = m; F = v; } }
    if (F) { u.aiLockK = 'help:' + F.id; u.aiLockT = t; const X = S.units[F.primary >= 0 && F.contacts.includes(F.primary) ? F.primary : F.contacts[0]]; if (X) { flankMove(S, u, X); return; } }
    if (cmdOf(S, s, 'charge')) { const E = known(S, s).filter(x => active(x) && x.state !== 'rout' && dist(u, x) < 200).sort((a, b) => dist(a, u) - dist(b, u))[0]; if (E) { u.aiLockK = 'atk'; attackMove(S, u, E, true); return; } }
  }
  // 敵軍逼近到 50 m 內就迎擊
  const E = known(S, s).filter(x => active(x) && x.state !== 'rout' && dist(u, x) < 50).sort((a, b) => dist(a, u) - dist(b, u))[0];
  if (E) { u.aiLockK = 'atk'; attackMove(S, u, E); return; }
  if (sl) moveTo(u, sl.x, Yl(s, sl.yl), false);
}
// 從較近的那一側繞到目標側後方再接戰
function flankMove(S: State, u: Unit, X: Unit) {
  u.target = X.id; u.targetT = S.t;
  const side = Math.sign((u.x - X.x) * -Math.sin(X.f) + (u.y - X.y) * Math.cos(X.f)) || 1;
  const fx = X.x + (-Math.sin(X.f)) * side * 28 - Math.cos(X.f) * 10, fy = X.y + Math.cos(X.f) * side * 28 - Math.sin(X.f) * 10;
  if (Math.hypot(fx - u.x, fy - u.y) > 20) moveTo(u, fx, fy, true); else moveTo(u, X.x, X.y, true);
}

// ---------------- 武將技 ----------------
function skillAI(S: State, u: Unit, eff: number) {
  const R = S.R, t = S.t, s = u.side;
  if (!R.skillsOn || !u.skill || !u.cmdAlive || u.skillCd > t) return;
  const contacts = u.contacts.map(c => S.units[c]);
  const engaged = contacts.length > 0;
  switch (u.skill) {
    case 'fujimi': case 'teppeki': case 'koshu': {
      const charged = contacts.some(c => isCav(c) && c.chargeUntil > t);
      const dirs = new Set(contacts.filter(c => fighting(c, t)).map(c => cat(c, u)));
      if (engaged && (charged || dirs.size >= 2 || eff < 60)) useSkill(S, u);
      break;
    }
    case 'kesshi': case 'senpo': case 'shinsa': {
      if (engaged && eff >= 50 && contacts.some(c => pMorale(S, s, c) <= eff)) useSkill(S, u);
      break;
    }
    case 'akazonae': case 'shoki': {
      const tg = S.units[u.target];
      if (tg && active(tg) && !engaged) { const d = dist(u, tg); if (d > 40 && d < 160 && pType(S, s, tg) !== 'spear') useSkill(S, u); }
      break;
    }
    case 'kyusha': case 'sandan': { const tg = S.units[u.fireTarget]; if (tg && u.ammo >= 4 && dist(u, tg) < archerRange(S, u, tg) * 0.9 && !engaged) useSkill(S, u); break; }
    case 'toseki': {
      const tg = S.units.filter(x => x.side !== s && active(x) && dist(u, x) <= 50 && vis(S, s, x) >= 2).sort((a, b) => dist(a, u) - dist(b, u))[0];
      if (tg) useSkill(S, u, tg.id); break;
    }
    case 'assei': {
      const tg = known(S, s).filter(x => active(x) && vis(S, s, x) >= 2 && dist(u, x) < 170 && (isCav(x) || x.run)).sort((a, b) => dist(a, u) - dist(b, u))[0];
      if (tg) useSkill(S, u, tg.id); break;
    }
    case 'kobu': if (eff < 40) useSkill(S, u); break;
    case 'shingari': if (engaged && eff < 45) useSkill(S, u); break;
    case 'furin': {
      const n = S.units.filter(v => v.side === s && active(v) && v.contacts.length).length;
      if (n >= 3) useSkill(S, u); break;
    }
    case 'kuruma': {
      const near = S.units.filter(v => v.side === s && active(v) && !isRanged(v) && dist(u, v) <= 100 && (v.contacts.length || known(S, s).some(x => active(x) && dist(v, x) < 70))).length;
      if (near >= 3) useSkill(S, u); break;
    }
  }
}

// ---------------- 忍者 ----------------
function ninjaAI(S: State, s: Side, A: SideAI, jutsu = true) {
  const t = S.t, e = (1 - s) as Side;
  const clan = CLANS[S.clan[s]];
  const hover = Math.max(28, STEALTH_R[clan.stealth] + 8);
  const enemies = S.units.filter(u => u.side === e && active(u));
  const ens = S.units.filter(u => u.side === e && onField(u));
  // 交戰中心
  let cx = 0, cy = 0, cn = 0;
  for (const u of S.units) if (u.side === e && active(u) && u.contacts.length) { cx += u.x; cy += u.y; cn++; }
  const clash = cn ? { x: cx / cn, y: cy / cn } : null;
  const eg = general(S, e);
  for (const n of S.ninjas) {
    if (n.side !== s || !n.alive || n.manual) continue;
    if (n.detUntil > t) { n.tx = n.x; n.ty = Yl(s, MAP.base[s].yl - 60); continue; }
    let tx = n.x, ty = n.y;
    if (S.R.fogV2) {
      // 情報 v2：只能用己方看得到的敵軍；偵察兵走掃描航線把敵方半場掃過一遍
      const seen = enemies.filter(u => vis(S, s, u) >= 1).map(u => seenPos(S, s, u));
      const cen = seen.length ? { x: seen.reduce((a, p) => a + p.x, 0) / seen.length, y: seen.reduce((a, p) => a + p.y, 0) / seen.length } : null;
      if (n.role === 'scoutW' || n.role === 'scoutE') {
        const Ex = MAP.base[e].x, cx = (x: number) => clamp(x, 40, 960); // 掃描敵方基點附近（己方座標）
        const W: [number, number][] = [[cx(Ex - 220), 400], [cx(Ex - 220), 560], [cx(Ex - 60), 560], [cx(Ex - 60), 430], [cx(Ex + 90), 470], [cx(Ex + 90), 640], [cx(Ex - 100), 640], [cx(Ex - 220), 500]];
        const path = n.role === 'scoutW' ? W : W.map(([x, y]) => [cx(2 * Ex - x), y] as [number, number]);
        const i = (n.wp ?? 0) % path.length; const [px, py] = path[i]; tx = px; ty = Yl(s, py);
        if (Math.hypot(n.x - tx, n.y - ty) < 20) n.wp = i + 1;
      } else if (n.role === 'rear') {
        if (vis(S, s, eg) >= 1) { const p = seenPos(S, s, eg); tx = p.x; ty = p.y + (s === 0 ? 60 : -60); } else { tx = clamp(MAP.base[e].x + (n.id % 2 ? 80 : -80), 40, 960); ty = Yl(s, 600); }
      } else { // shadow：跟著看得到的敵軍中心；沒看到任何敵軍就往敵方半場推進
        if (clash) { tx = clash.x + (n.id % 2 ? 50 : -50); ty = clash.y; }
        else if (cen) { tx = cen.x + (n.id % 2 ? 50 : -50); ty = cen.y; }
        else { tx = clamp(MAP.base[e].x + (n.id % 2 ? 120 : -120), 40, 960); ty = Yl(s, 480); }
      }
    } else switch (n.role) {
      case 'scoutW': tx = 200; ty = Yl(s, t < 90 ? 420 : 470); break;
      case 'scoutE': tx = 800; ty = Yl(s, t < 90 ? 420 : 470); break;
      case 'rear': tx = eg.x; ty = eg.y + (s === 0 ? 60 : -60); break;
      default: { // shadow：跟著敵軍主力
        const c = clash ?? (enemies.length ? { x: enemies.reduce((a, b) => a + b.x, 0) / enemies.length, y: enemies.reduce((a, b) => a + b.y, 0) / enemies.length } : { x: 500, y: 350 });
        tx = c.x + (n.id % 2 ? 50 : -50); ty = c.y - fwd(s) * 0; break;
      }
    }
    // 與敵軍保持距離（v2：只避開看得到的敵軍）
    const avoid = S.R.fogV2 ? enemies.filter(u => vis(S, s, u) >= 1) : enemies;
    let ne: Unit | null = null, nd = 1e9;
    for (const u of avoid) { const d = Math.hypot(u.x - tx, u.y - ty); if (d < nd) { nd = d; ne = u; } }
    if (ne && nd < hover) { const ax = tx - ne.x, ay = ty - ne.y, L = Math.hypot(ax, ay) || 1; tx = ne.x + ax / L * hover; ty = ne.y + ay / L * hover; }
    let cur: Unit | null = null, cd = 1e9;
    for (const u of avoid) { const d = Math.hypot(u.x - n.x, u.y - n.y); if (d < cd) { cd = d; cur = u; } }
    if (cur && cd < hover - 2) { const ax = n.x - cur.x, ay = n.y - cur.y, L = Math.hypot(ax, ay) || 1; tx = cur.x + ax / L * (hover + 12); ty = cur.y + ay / L * (hover + 12); }
    n.tx = tx; n.ty = ty;
  }
  if (!jutsu || S.jutsuCd[s] > t) return;
  const nin = S.ninjas.filter(n => n.side === s && n.alive);
  if (!nin.length) return;
  const within = (x: number, y: number) => nin.some(n => Math.hypot(n.x - x, n.y - y) <= 80);
  const act = (j: string) => !S.R.clanPassive || clan.jutsu[0] === j; // clanPassive：只有主動忍術能放
  const vEn = ens.filter(u => vis(S, s, u) >= 2 && active(u));
  switch (clan.id) {
    case 'mitsumono': {
      const tg = vEn.filter(u => within(u.x, u.y) && u.contacts.length && pMorale(S, s, u) <= 65).sort((a, b) => pMorale(S, s, a) - pMorale(S, s, b))[0];
      if (tg) { useJutsu(S, s, 'rumor', { x: tg.x, y: tg.y, unit: tg.id }); break; }
      if (act('monomi') && clash && within(clash.x, clash.y) && cn >= 2) useJutsu(S, s, 'monomi', { x: clash.x, y: clash.y });
      break;
    }
    case 'nokizaru': {
      if (S.R.giseiOn && act('gisei') && !A.giseiDone && t > 20 && t < 150) {
        const own = S.units.find(u => u.side === s && u.type === (S.R.giseiProtect ? 'archer' : 'spear') && active(u) && !u.contacts.length && within(u.x, u.y));
        if (own && useJutsu(S, s, 'gisei', { x: own.x, y: own.y, unit: own.id })) { A.giseiDone = true; break; }
      }
      if (S.R.sennyuOn) {
        const tg = vEn.filter(u => within(u.x, u.y) && vis(S, s, u) < 3).sort((a, b) => (b.contacts.length - a.contacts.length) || (Q[b.type] * b.men - Q[a.type] * a.men))[0];
        if (tg && useJutsu(S, s, 'sennyu', { x: tg.x, y: tg.y, unit: tg.id })) break;
      }
      const en = S.ninjas.filter(m => m.side === e && m.alive && m.detUntil <= t && nin.some(n => Math.hypot(n.x - m.x, n.y - m.y) <= 200));
      if (act('sakuteki') && en.length) { const n0 = nin.find(n => en.some(m => Math.hypot(n.x - m.x, n.y - m.y) <= 200))!; useJutsu(S, s, 'sakuteki', { x: n0.x, y: n0.y }); }
      break;
    }
    case 'iga': {
      const cand = ens.filter(u => active(u) && u.cmdAlive && u.type !== 'general' && !u.reinf && vis(S, s, u) >= 1 && within(u.x, u.y));
      const idle = cand.find(u => !u.contacts.length);
      if (idle) { useJutsu(S, s, 'ansatsu', { x: idle.x, y: idle.y, unit: idle.id }); break; }
      const pi = S.points.findIndex(p => p.owner === e && p.burnedUntil <= t && within(p.x, p.y));
      if (act('houka') && pi >= 0) { useJutsu(S, s, 'houka', { x: S.points[pi].x, y: S.points[pi].y, point: pi }); break; }
      if (cand.length && t > 120 && !S.R.assassinFailKills) useJutsu(S, s, 'ansatsu', { x: cand[0].x, y: cand[0].y, unit: cand[0].id });
      break;
    }
    case 'koga': {
      const shot = S.units.find(u => u.side === s && active(u) && t - u.lastArrowT < 6 && within(u.x, u.y));
      if (shot) { useJutsu(S, s, 'kirigakure', { x: shot.x, y: shot.y }); break; }
      if (act('sahou') && t > 30 && t < 150) {
        const n0 = nin.find(n => n.role === 'scoutW' || n.role === 'scoutE');
        if (n0) useJutsu(S, s, 'sahou', { x: n0.x, y: n0.y });
      }
      break;
    }
  }
}
