// 節奏與兵種使用量的批次量測：node tools/pace.ts <局數> [設定名 ...]
// 雙方 AI、忍者眾隨機。輸出：每局時長、首次接戰、結束方式、潰走／重整／AI 撤退次數、主將與騎兵的接戰時間與移動速度。
import { CLAN_CHOICES } from '../src/sim/data.ts';
import { newState, step, mulberry32, dist, type State } from '../src/sim/sim.ts';
import { setup } from '../src/sim/ai.ts';
import { GAME_RULES, SIM_DT } from '../src/sim/game-rules.ts';
import { makeRules, type Rules } from '../src/sim/rules.ts';

const VARIANTS: Record<string, Partial<Rules>> = {
  base: {},
  steady: { aiSteady: true },
  line: { aiSteady: true, aiLine: true },
  crane: { aiSteady: true, aiLine: true, aiFormation: 'crane' },
  craneT: { aiSteady: true, aiLine: true, aiFormation: 'craneT' },
  two: { streams: 'two', aiHoldYl: 250 }, east: { streams: 'east' },
  fog2: { fogV2: true },
  gunWeak: { gunHit: 0.4, gunDmg: 4 }, cannonStrong: { cannonLam: 2.6, cannonReload: 25, cannonDmg: 12, cannonSplash: 0.6 }, gcBoth: { gunHit: 0.4, gunDmg: 4, cannonLam: 2.6, cannonReload: 25, cannonDmg: 12, cannonSplash: 0.6 },
  gcMid: { gunHit: 0.45, gunDmg: 4, cannonLam: 2.2, cannonReload: 30, cannonDmg: 12, cannonSplash: 0.4 }, gcDef: { gunHit: 0.5, gunDmg: 5, cannonLam: 1.8, cannonReload: 40, cannonDmg: 10, cannonSplash: 0 },
  gcMore: { gunHit: 0.35, gunDmg: 4, gunReload: 18, cannonLam: 3, cannonReload: 22, cannonDmg: 12, cannonSplash: 0.8 },
  fix: { frontageCap: true, unitSeparation: true },
  ship: { streams: 'two', aiHoldYl: 250, arrowSplash: 0.5, crowdSlow: 0.25, aiFlankReact: true }, shipFlat: { streams: 'two', aiHoldYl: 250, arrowSplash: 0.5, crowdSlow: 0.25, aiFlankReact: true, reliefNoise: 0 }, shipOneHill: { streams: 'two', aiHoldYl: 250, arrowSplash: 0.5, crowdSlow: 0.25, aiFlankReact: true, reliefHills: false }, shipNoStream: { arrowSplash: 0.5, crowdSlow: 0.25, aiFlankReact: true },
  noRally: { maxRouts: 1 },
  noRetreat: { aiRetreat: false },
  rallyCap50: { rallyCap: 50 },
  cap50noRetreat: { rallyCap: 50, aiRetreat: false },
  noRallyNoRetreat: { maxRouts: 1, aiRetreat: false },
  range200: { archerRange: 200 },
  gen: { aiGenBack: 40, aiGenCommit: true },
  pkg: { rallyCap: 50, aiRetreat: false, archerRange: 200, aiGenBack: 40, aiGenCommit: true },
  rallyGen: { rallyNearGen: 90, aiRetreat: false, archerRange: 200, aiGenBack: 40, aiGenCommit: true },
  pkgNoRally: { maxRouts: 1, aiRetreat: false, archerRange: 200, aiGenBack: 40, aiGenCommit: true },
};

function one(R: Rules, seed: number) {
  const pre = mulberry32(seed * 7919 + 13);
  const clan: [string, string] = [CLAN_CHOICES[0][Math.floor(pre() * 3)], CLAN_CHOICES[1][Math.floor(pre() * 3)]];
  const S: State = newState(R, seed, clan);
  S.dt = SIM_DT; setup(S); S.fx = [];
  let firstContact = -1, rallies = 0, retreats = 0, reengage = 0;
  const rallied = new Set<number>();
  const wasRet = new Map<number, boolean>();
  let genContact = 0, genMoveT = 0, cavContact = 0, cavDist = 0, cavMoveT = 0, infDist = 0, infMoveT = 0;
  const prev = new Map<number, [number, number]>();
  let arrowHits = 0;
  while (!S.over) {
    for (const u of S.units) prev.set(u.id, [u.x, u.y]);
    const hpB = S.units.map(u => u.hp);
    step(S);
    const rallyNow = new Set<number>();
    for (const e of S.fx!) {
      if (e.k === 'rally') { rallies++; rallied.add(e.a); rallyNow.add(e.a); }
      if (e.k === 'volley') arrowHits += e.n ?? 0;
    }
    S.fx!.length = 0;
    for (const u of S.units) {
      if (u.state === 'gone') continue;
      const r = u.retreating, w = wasRet.get(u.id) ?? false;
      if (r && !w && !rallyNow.has(u.id)) retreats++; // AI 有序撤退（重整也會設 retreating，排除）
      wasRet.set(u.id, r);
      if (u.contacts.length && firstContact < 0) firstContact = S.t;
      if (rallied.has(u.id) && u.contacts.length && !u.retreating) { reengage++; rallied.delete(u.id); }
      const p = prev.get(u.id); const d = p ? Math.hypot(u.x - p[0], u.y - p[1]) : 0;
      const active = u.state === 'high' || u.state === 'steady' || u.state === 'waver';
      if (u.type === 'general') { if (u.contacts.length) genContact += S.dt; }
      if (u.type === 'cav' && active) { if (u.contacts.length) cavContact += S.dt; if (d > 0.05) { cavDist += d; cavMoveT += S.dt; } }
      if ((u.type === 'spear' || u.type === 'samurai') && active && d > 0.05) { infDist += d; infMoveT += S.dt; }
    }
    void hpB; void genMoveT;
  }
  // AI 撤退：從 rec 無法直接取得，改用 routs 前的 ret 標記之外，另計 retreating 由 false→true 且非重整的次數
  void dist;
  const routs = S.rec.routs.filter(r => !r.wipe).length;
  return { retreats, t: S.over!.t, type: S.over!.type, win: S.over!.winner, first: firstContact, routs, rallies, reengage,
    genContact, cavContact, cavSpeed: cavMoveT ? cavDist / cavMoveT : 0, infSpeed: infMoveT ? infDist / infMoveT : 0, arrowHits,
    cmdDeaths: S.rec.cmdDeaths.filter(c => c.who !== 'advisor').length, genDeath: S.rec.cmdDeaths.filter(c => c.who === 'general').length };
}

const n = Number(process.argv[2] || 100);
const names = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(VARIANTS);
for (const name of names) {
  const R = makeRules({ ...GAME_RULES, ...VARIANTS[name], name });
  const rs = Array.from({ length: n }, (_, i) => one(R, 1000 + i));
  const avg = (f: (r: typeof rs[0]) => number) => (rs.reduce((a, r) => a + f(r), 0) / rs.length);
  const pct = (f: (r: typeof rs[0]) => boolean) => `${Math.round(rs.filter(f).length / rs.length * 100)}%`;
  console.log(`${name.padEnd(17)} 時長 ${avg(r => r.t).toFixed(0)}s 首戰 ${avg(r => r.first).toFixed(0)}s 交戰期 ${avg(r => r.t - r.first).toFixed(0)}s | 崩潰 ${pct(r => r.type === 'collapse')} 時間 ${pct(r => r.type === 'time')} 據點 ${pct(r => r.type === 'points')} 全滅 ${pct(r => r.type === 'wipe')} | 武田勝 ${pct(r => r.win === 0)} | 潰走 ${avg(r => r.routs).toFixed(1)} 重整 ${avg(r => r.rallies).toFixed(1)} AI撤退 ${avg(r => r.retreats).toFixed(1)} 再上陣 ${avg(r => r.reengage).toFixed(1)} | 主將接戰 ${avg(r => r.genContact / 2).toFixed(0)}s 騎兵接戰 ${avg(r => r.cavContact / 2).toFixed(0)}s | 速度 騎 ${avg(r => r.cavSpeed).toFixed(1)} 步 ${avg(r => r.infSpeed).toFixed(1)} m/s | 箭命中 ${avg(r => r.arrowHits).toFixed(0)}`);
}

