// 《決戰》士氣模擬器 — 雙方共用的 AI（普通難度：反應延遲約 1 秒，受戰爭迷霧限制）
import { UT, MAP, CLANS, STEALTH_R, ROSTER_T, ROSTER_U, type Side, type UType } from './data.ts';
import {
  type State, type Unit, type Ninja, makeUnit, dist, cat, clamp, active, fighting, has, isCav, effM, general,
  useSkill, useStrategy, battleCry, useJutsu, inForest, inPaddy, updDims, onField,
} from './sim.ts';

type SideAI = { posture: 'advance' | 'hold' | 'attack'; attackT: number; aggr: number; cavWing: 'W' | 'E';
  nextTac: number; nextStrat: number; nextNin: number; giseiDone: boolean };

const Yl = (side: Side, y: number) => side === 0 ? y : 700 - y; // 己方座標 → 絕對座標
const fwd = (side: Side) => side === 0 ? 1 : -1;
const Q: Record<UType, number> = { spear: 1, archer: 0.8, samurai: 2.2, cav: 2.2, general: 2.5 };

// ---------------- 佈陣 ----------------
export function setup(S: State) {
  const rng = S.rng;
  const ai: [SideAI, SideAI] = [0, 1].map(() => ({
    posture: 'advance', attackT: 45 + rng() * 105, aggr: 0.8 + rng() * 0.4, cavWing: rng() < 0.5 ? 'W' : 'E',
    nextTac: 0, nextStrat: 0, nextNin: 0, giseiDone: false,
  } as SideAI)) as [SideAI, SideAI];
  S.meta.ai = ai;
  const order: string[][] = [];
  for (const s of [0, 1] as Side[]) order[s] = rng() < 0.6 ? ['spear1', 'samurai1', 'samurai2', 'spear2'] : ['samurai1', 'spear1', 'spear2', 'samurai2'];
  // 情報力高的一方可以看到對方佈陣再應對（雙方都高時各自隨機）
  const intel = (s: Side) => !S.R.ninjaOn || !S.R.ninjaSides[s] ? 'low' : S.clan[s] === 'nokizaru' ? S.R.nokizaruIntel : CLANS[S.clan[s]].intel;
  for (const s of [0, 1] as Side[]) {
    const e = (1 - s) as Side;
    if (S.R.counterDeploy && S.R.fogOn && intel(s) === 'high' && intel(e) !== 'high') {
      ai[s].cavWing = ai[e].cavWing === 'W' ? 'E' : 'W';
      order[s] = ai[e].cavWing === 'W' ? ['spear2', 'samurai1', 'samurai2', 'spear1'] : ['spear1', 'samurai1', 'samurai2', 'spear2'];
    }
  }
  S.meta.deploy = order.map((o, s) => o.join(',') + '|' + ai[s].cavWing);
  for (const s of [0, 1] as Side[]) {
    const roster = s === 0 ? ROSTER_T : ROSTER_U;
    const R = (k: string) => roster.find(r => r.key === k)!;
    const mk = (k: string, x: number, yl: number) => makeUnit(S, s, R(k), R(k).type, k, x, Yl(s, yl));
    mk('gen', 500, 40).role = 'general';
    const xs = [410, 470, 530, 590];
    order[s].forEach((k, i) => { const u = mk(k, xs[i], 110); u.role = 'line'; });
    mk('archer1', 445, 70).role = 'archer'; mk('archer2', 555, 70).role = 'archer';
    mk('cav', ai[s].cavWing === 'W' ? 300 : 700, 90).role = 'cav';
  }
  S.meta.tenkyu = S.units.find(u => u.side === 0 && u.key === 'samurai1');
  // 據點分派：西端的長槍取村落、另一隊長槍取寺廟；騎兵先取自己那一翼的據點
  for (const s of [0, 1] as Side[]) {
    const mine = S.units.filter(u => u.side === s);
    const spears = mine.filter(u => u.type === 'spear').sort((a, b) => a.x - b.x);
    spears[0].role = 'cap:village'; spears[1].role = 'cap:temple';
    const cav = mine.find(u => u.type === 'cav')!; cav.role = ai[s].cavWing === 'E' ? 'cap:supply' : 'cav';
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
    for (let i = 0; i < c.n; i++) S.ninjas.push({ id: S.ninjas.length, side: s, x: 500 + (i - 2) * 10, y: Yl(s, 30), alive: true,
      detUntil: -1, immuneUntil: -1, nearT: 0, role: roles[i], tx: 500, ty: Yl(s, 30), fleeUntil: -1 });
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
    if (S.R.ninjaOn && t >= A.nextNin) { A.nextNin = t + 1; ninjaAI(S, s, A, full); }
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
  const pref: Record<UType, Record<UType, number>> = {
    samurai: { archer: 1.0, spear: 0.6, samurai: 0.3, cav: -0.5, general: 0.5 },
    spear: { cav: 1.2, general: 1.0, samurai: 0.2, spear: 0.3, archer: 0.6 },
    cav: { archer: 1.5, general: 0.8, samurai: 0.3, spear: -1.5, cav: 0.5 },
    general: { archer: 0.8, spear: 0.2, samurai: 0.4, cav: 0.4, general: 0.6 },
    archer: { archer: 0.5, spear: 0.5, samurai: 0.5, cav: 0.5, general: 0.5 },
  };
  sc += pref[u.type][pt];
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
  // 軍略
  if (R.strategyOn && g.advAlive && active(g)) {
    if (g.strategy === 'kitsutsuki') {
      const flankers = mine.filter(u => u.contacts.some(c => cat(u, S.units[c]) > 0)).length;
      const cavAttacking = mine.some(u => u.type === 'cav' && u.target >= 0 && dist(u, S.units[u.target]) < 150);
      if (engagedCount >= 3 && (flankers >= 1 || cavAttacking)) useStrategy(S, s);
    } else if (engagedCount >= 3) useStrategy(S, s);
  }
  for (const u of mine) {
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
    if (u.retreating) {
      if (eff >= 65 && !u.contacts.length) { u.retreating = false; }
      else {
        const tx = gActive ? g.x : u.x, ty = gActive ? g.y - fwd(s) * 30 : Yl(s, 40);
        moveTo(u, tx, ty, true);
        continue;
      }
    }
    // 陣型
    if (u.type === 'spear') {
      const cv = nearestEnemyCav(S, u, S.R.aiSteady && u.form === 'dense' ? 170 : 120);
      if (cv && !has(S, u, 'noFlankMorale')) { if (u.form !== 'dense') { u.form = 'dense'; updDims(u); } }
      else if (u.form !== 'line' && !has(S, u, 'noFlankMorale')) { u.form = 'line'; updDims(u); }
    } else if (u.type === 'archer') {
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
      case 'archer': archerAI(S, u, A); break;
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
  const xs: Record<string, number> = { spear1: 430, samurai1: 470, samurai2: 530, spear2: 570 };
  const x = xs[u.key] ?? u.x;
  return { x, y: Yl(s, 285) };
}

function infantryAI(S: State, u: Unit, A: SideAI) {
  const t = S.t, s = u.side;
  if (u.contacts.length) return; // 接戰中：鎖定
  // 據點任務
  if (u.role.startsWith('cap:')) {
    const pid = u.role.slice(4);
    const p = S.points.find(q => q.id === pid)!;
    if (p.owner !== s || p.progSide === (1 - s)) {
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
      const prot = S.units.filter(v => v.side === s && active(v) && (v.type === 'archer' || v.type === 'general'))
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

function attackMove(S: State, u: Unit, E: Unit) {
  const p = seenPos(S, u.side, E);
  const d = Math.hypot(p.x - u.x, p.y - u.y);
  u.target = E.id;
  moveTo(u, p.x, p.y, d < 70 && u.state !== 'waver');
}

function archerAI(S: State, u: Unit, A: SideAI) {
  const s = u.side, t = S.t;
  if (u.contacts.length) return;
  // 選擇射擊目標
  let best: Unit | null = null, bs = -1e9;
  const rng = S.R.archerRange + (u.passive === 'range20' && u.cmdAlive ? 20 : 0);
  for (const E of known(S, s)) {
    if (vis(S, s, E) < 2 || E.state === 'gone') continue;
    const d = dist(u, E); if (d > rng * 1.2) continue;
    let sc = -d / 150 + (100 - pMorale(S, s, E)) / 60;
    if (E.contacts.some(c => S.units[c].side === s)) sc += 0.6;
    if (inForest(E.x, E.y)) sc -= 0.8;
    if (E.state === 'rout' || E.state === 'shattered') sc -= 2;
    if (sc > bs) { bs = sc; best = E; }
  }
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
  if (A.posture === 'advance' || A.posture === 'hold') {
    moveTo(u, u.key === 'archer1' ? 455 : 545, Yl(s, 245)); return;
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
    if (c) moveTo(u, c.x + (u.key === 'archer1' ? -30 : 30), c.y - fwd(s) * 60);
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
    if ((stuck || bad) && u.state !== 'waver' && !(S.R.aiSteady && t - u.aiLockT < 25)) {
      u.cavPhase = 'withdraw'; u.cavPhaseT = t; u.disUntil = t + 6; u.aiLockT = t; u.targetT = t; // 止抖：退衝至少隔 25 秒，退開後仍打同一目標
      const ax = u.x - tg.x, ay = u.y - tg.y, L = Math.hypot(ax, ay) || 1;
      moveTo(u, u.x + ax / L * 80, u.y + ay / L * 80 - fwd(s) * 20, true);
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
  if (A.posture === 'advance') { moveTo(u, A.cavWing === 'W' ? 320 : 690, Yl(s, 200)); return; }
  const E = pickTarget(S, u);
  if (!E || (A.posture === 'hold' && dist(u, E) > 160 && !(E.type === 'archer' || E.state === 'rout'))) {
    moveTo(u, A.cavWing === 'W' ? 320 : 690, Yl(s, 230)); return;
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
    case 'kyusha': { const tg = S.units[u.fireTarget]; if (tg && u.ammo >= 5 && dist(u, tg) < 160 && !engaged) useSkill(S, u); break; }
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
      const near = S.units.filter(v => v.side === s && active(v) && v.type !== 'archer' && dist(u, v) <= 100 && (v.contacts.length || known(S, s).some(x => active(x) && dist(v, x) < 70))).length;
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
    if (n.detUntil > t) { n.tx = n.x; n.ty = Yl(s, 30); continue; }
    let tx = n.x, ty = n.y;
    switch (n.role) {
      case 'scoutW': tx = 200; ty = Yl(s, t < 90 ? 420 : 470); break;
      case 'scoutE': tx = 800; ty = Yl(s, t < 90 ? 420 : 470); break;
      case 'rear': tx = eg.x; ty = eg.y + (s === 0 ? 60 : -60); break;
      default: { // shadow：跟著敵軍主力
        const c = clash ?? (enemies.length ? { x: enemies.reduce((a, b) => a + b.x, 0) / enemies.length, y: enemies.reduce((a, b) => a + b.y, 0) / enemies.length } : { x: 500, y: 350 });
        tx = c.x + (n.id % 2 ? 50 : -50); ty = c.y - fwd(s) * 0; break;
      }
    }
    // 與敵軍保持距離
    let ne: Unit | null = null, nd = 1e9;
    for (const u of enemies) { const d = Math.hypot(u.x - tx, u.y - ty); if (d < nd) { nd = d; ne = u; } }
    if (ne && nd < hover) { const ax = tx - ne.x, ay = ty - ne.y, L = Math.hypot(ax, ay) || 1; tx = ne.x + ax / L * hover; ty = ne.y + ay / L * hover; }
    let cur: Unit | null = null, cd = 1e9;
    for (const u of enemies) { const d = Math.hypot(u.x - n.x, u.y - n.y); if (d < cd) { cd = d; cur = u; } }
    if (cur && cd < hover - 2) { const ax = n.x - cur.x, ay = n.y - cur.y, L = Math.hypot(ax, ay) || 1; tx = cur.x + ax / L * (hover + 12); ty = cur.y + ay / L * (hover + 12); }
    n.tx = tx; n.ty = ty;
  }
  if (!jutsu || S.jutsuCd[s] > t) return;
  const nin = S.ninjas.filter(n => n.side === s && n.alive);
  if (!nin.length) return;
  const within = (x: number, y: number) => nin.some(n => Math.hypot(n.x - x, n.y - y) <= 80);
  const [j1, j2] = clan.jutsu;
  const vEn = ens.filter(u => vis(S, s, u) >= 2 && active(u));
  switch (clan.id) {
    case 'mitsumono': {
      const tg = vEn.filter(u => within(u.x, u.y) && u.contacts.length && pMorale(S, s, u) <= 65).sort((a, b) => pMorale(S, s, a) - pMorale(S, s, b))[0];
      if (tg) { useJutsu(S, s, 'rumor', { x: tg.x, y: tg.y, unit: tg.id }); break; }
      if (clash && within(clash.x, clash.y) && cn >= 2) useJutsu(S, s, 'monomi', { x: clash.x, y: clash.y });
      break;
    }
    case 'nokizaru': {
      if (S.R.giseiOn && !A.giseiDone && t > 20 && t < 150) {
        const own = S.units.find(u => u.side === s && u.type === (S.R.giseiProtect ? 'archer' : 'spear') && active(u) && !u.contacts.length && within(u.x, u.y));
        if (own && useJutsu(S, s, 'gisei', { x: own.x, y: own.y, unit: own.id })) { A.giseiDone = true; break; }
      }
      if (S.R.sennyuOn) {
        const tg = vEn.filter(u => within(u.x, u.y) && vis(S, s, u) < 3).sort((a, b) => (b.contacts.length - a.contacts.length) || (Q[b.type] * b.men - Q[a.type] * a.men))[0];
        if (tg && useJutsu(S, s, 'sennyu', { x: tg.x, y: tg.y, unit: tg.id })) break;
      }
      const en = S.ninjas.filter(m => m.side === e && m.alive && m.detUntil <= t && nin.some(n => Math.hypot(n.x - m.x, n.y - m.y) <= 200));
      if (en.length) { const n0 = nin.find(n => en.some(m => Math.hypot(n.x - m.x, n.y - m.y) <= 200))!; useJutsu(S, s, 'sakuteki', { x: n0.x, y: n0.y }); }
      break;
    }
    case 'iga': {
      const cand = ens.filter(u => active(u) && u.cmdAlive && u.type !== 'general' && !u.reinf && vis(S, s, u) >= 1 && within(u.x, u.y));
      const idle = cand.find(u => !u.contacts.length);
      if (idle) { useJutsu(S, s, 'ansatsu', { x: idle.x, y: idle.y, unit: idle.id }); break; }
      const pi = S.points.findIndex(p => p.owner === e && p.burnedUntil <= t && within(p.x, p.y));
      if (pi >= 0) { useJutsu(S, s, 'houka', { x: S.points[pi].x, y: S.points[pi].y, point: pi }); break; }
      if (cand.length && t > 120 && !S.R.assassinFailKills) useJutsu(S, s, 'ansatsu', { x: cand[0].x, y: cand[0].y, unit: cand[0].id });
      break;
    }
    case 'koga': {
      const shot = S.units.find(u => u.side === s && active(u) && t - u.lastArrowT < 6 && within(u.x, u.y));
      if (shot) { useJutsu(S, s, 'kirigakure', { x: shot.x, y: shot.y }); break; }
      if (t > 30 && t < 150) {
        const n0 = nin.find(n => n.role === 'scoutW' || n.role === 'scoutE');
        if (n0) useJutsu(S, s, 'sahou', { x: n0.x, y: n0.y });
      }
      break;
    }
  }
  void j1; void j2;
}
