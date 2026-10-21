// 指令層：每個模擬步之前執行。
// 玩家：攻擊指令（追擊目標、弓兵進入射程）、弓兵自由射擊、重整後待命。
// 敵軍：M5 起由 sim/ai.ts 指揮（holdAI 保留給測試）。
// 戰場迷霧：追擊與射擊只用「玩家看得到的位置」（識別＝實際位置；察覺＝概略位置；看不到＝最後位置）。

import { active, effM, dist, isCav, canSee, angDiff, type State, type Unit } from '../sim/sim.ts';


export const retreatOrders = new Set<number>(); // 玩家下令撤退中的部隊
export const attackRun = new Map<number, boolean>(); // 玩家攻擊指令是否全程跑步（雙擊）

function routing(u: Unit) { return u.state === 'rout' || u.state === 'shattered'; }

function bestArrowTarget(S: State, u: Unit, prefer = -1): number {
  if (prefer >= 0) {
    const T = S.units[prefer];
    if (T && T.state !== 'gone' && canSee(S, u.side, T) && dist(u, T) <= S.R.archerRange) return prefer;
  }
  let best = -1, bs = -1e9;
  for (const E of S.units) {
    if (E.side === u.side || E.state === 'gone' || !canSee(S, u.side, E)) continue;
    const d = dist(u, E); if (d > S.R.archerRange) continue;
    let sc = -d / S.R.archerRange;
    if (routing(E)) sc -= 2;
    if (E.contacts.some(c => S.units[c].side === u.side)) sc += 0.4;
    if (sc > bs) { bs = sc; best = E.id; }
  }
  return best;
}

function faceToward(u: Unit, x: number, y: number, rate: number) {
  const want = Math.atan2(y - u.y, x - u.x);
  const d = angDiff(want, u.f);
  u.f += Math.max(-rate, Math.min(rate, d));
}

const lastSeen = new Map<number, { x: number; y: number }>();
export function seenPos(S: State, side: 0 | 1, T: Unit): { x: number; y: number } | null {
  const v = S.vis[side][T.id];
  if (v >= 2 || T.contacts.some(c => S.units[c].side === side)) { const p = { x: T.x, y: T.y }; lastSeen.set(T.id, p); return p; }
  if (v === 1) { const n = S.noisy[side].get(T.id); if (n) { lastSeen.set(T.id, { x: n.x, y: n.y }); return n; } }
  return lastSeen.get(T.id) ?? null;
}
function chase(S: State, u: Unit, T: Unit, run: boolean) {
  const p = seenPos(S, u.side as 0 | 1, T);
  if (!p) { u.target = -1; return; }
  if (S.vis[u.side][T.id] === 0 && Math.hypot(p.x - u.x, p.y - u.y) < 12) { u.target = -1; u.hasDest = false; return; } // 追丟了
  u.destX = p.x; u.destY = p.y; u.hasDest = true; u.finalF = NaN;
  u.run = run || isCav(u) || Math.hypot(p.x - u.x, p.y - u.y) < 70;
  if (u.state === 'waver') u.run = false;
}

export function playerOrders(S: State) {
  const dt = S.dt;
  // 大名模式：由 AI 帶的部隊不走玩家指令層，只有親自接管的部隊才處理
  const aiLed = ((S.meta.aiSides as number[] | undefined) ?? []).includes(0);
  const manual = S.meta.manual as Set<number> | undefined;
  for (const u of S.units) {
    if (u.side !== 0) continue;
    if (aiLed && !manual?.has(u.id)) continue;
    if (!active(u)) { u.target = -1; continue; }
    // 玩家下的撤退令：退到目的地且脫離接戰才結束
    if (retreatOrders.has(u.id)) {
      if (!u.hasDest && !u.contacts.length) { retreatOrders.delete(u.id); u.retreating = false; }
      else { u.retreating = true; u.target = -1; continue; }
    }
    // 重整後的部隊：保持「整頓」直到玩家再次下令，或士氣回到 50
    if (u.retreating && effM(S, u) >= 50 && !u.contacts.length) u.retreating = false;
    let T = u.target >= 0 ? S.units[u.target] : null;
    if (T && (T.state === 'gone' || (routing(T) && !isCav(u) && dist(u, T) > 40))) {
      u.target = -1; T = null; if (u.type !== 'archer') u.hasDest = false;
    }
    if (u.type === 'archer') {
      const p = T ? seenPos(S, 0, T) : null;
      if (T && p) {
        const see = canSee(S, 0, T), want = see ? S.R.archerRange - 30 : 50;
        const d = Math.hypot(p.x - u.x, p.y - u.y) || 1;
        if (d > want + 10) {
          const k = (d - want) / d;
          u.destX = u.x + (p.x - u.x) * k; u.destY = u.y + (p.y - u.y) * k; u.hasDest = true; u.run = false; u.finalF = NaN;
        } else if (u.hasDest && u.finalF !== u.finalF) u.hasDest = false;
      }
      u.fireTarget = bestArrowTarget(S, u, u.target);
      if (!u.hasDest && !u.contacts.length && u.fireTarget >= 0) {
        const F = S.units[u.fireTarget]; faceToward(u, F.x, F.y, 0.8 * dt);
      }
      continue;
    }
    if (T && !u.contacts.includes(T.id)) chase(S, u, T, attackRun.get(u.id) ?? false);
  }
}

// 敵軍守備：記住開場位置，敵人進入 80 m 才出擊，追出 160 m 以外就回防
const home = new Map<number, { x: number; y: number; f: number }>();
export function holdAI(S: State) {
  for (const u of S.units) {
    if (u.side !== 1) continue;
    if (!home.has(u.id)) home.set(u.id, { x: u.x, y: u.y, f: u.f });
    if (!active(u)) { u.target = -1; continue; }
    const h = home.get(u.id)!;
    const goHome = () => {
      if (Math.hypot(u.x - h.x, u.y - h.y) > 3) { u.destX = h.x; u.destY = h.y; u.hasDest = true; u.run = false; u.finalF = h.f; }
    };
    if (u.retreating) {
      if (effM(S, u) >= 55 && !u.contacts.length) u.retreating = false;
      else { goHome(); continue; }
    }
    if (u.type === 'archer') {
      u.fireTarget = bestArrowTarget(S, u);
      if (!u.contacts.length && u.fireTarget >= 0 && !u.hasDest) { const F = S.units[u.fireTarget]; faceToward(u, F.x, F.y, 0.8 * S.dt); }
      if (!u.contacts.length) goHome();
      continue;
    }
    if (u.contacts.length) continue;
    const reach = u.type === 'general' ? 40 : 80;
    let E: Unit | null = null, bd = 1e9;
    for (const v of S.units) {
      if (v.side === 1 || !active(v) || !canSee(S, 1, v)) continue;
      const d = dist(u, v);
      if (d < reach && Math.hypot(v.x - h.x, v.y - h.y) < 160 && d < bd) { bd = d; E = v; }
    }
    if (E) { u.target = E.id; chase(S, u, E, false); }
    else { u.target = -1; goHome(); }
  }
}

