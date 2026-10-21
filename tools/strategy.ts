// 玩家策略模擬：node tools/strategy.ts <每種局數> [規則變體]
// 武田方套用各種「大名方針」對上預設的上杉 AI，看哪種策略佔優。blob＝全軍擠成一團一起衝（玩家疑慮的打法）。
import { CLAN_CHOICES } from '../src/sim/data.ts';
import { newState, step, type State } from '../src/sim/sim.ts';
import { setup, DEFAULT_DOCTRINE, type Doctrine, type Deploy, DEFAULT_DEPLOY } from '../src/sim/ai.ts';
import { GAME_RULES, SIM_DT } from '../src/sim/game-rules.ts';
import { makeRules, type Rules } from '../src/sim/rules.ts';

const RV: Record<string, Partial<Rules>> = { base: {}, fix: { frontageCap: true, unitSeparation: true } as Partial<Rules>, cap: { frontageCap: true } as Partial<Rules>, sep: { unitSeparation: true } as Partial<Rules> };
const STRATS: Record<string, { d: Partial<Doctrine>; dep?: Partial<Deploy> }> = {
  line:     { d: { formation: 'line', attack: 'volley', cav: 'raid' } },
  blob:     { d: { formation: 'blob', attack: 'now', cav: 'guard' } },
  blobHold: { d: { formation: 'blob', attack: 'volley', cav: 'guard' } },
  stack:    { d: { formation: 'stack', attack: 'now', cav: 'guard' } },
  crane:    { d: { formation: 'crane', attack: 'volley', cav: 'raid' } },
  fish:     { d: { formation: 'fish', attack: 'now', cav: 'raid' } },
  oblique:  { d: { formation: 'oblique', attack: 'now', cav: 'free' }, dep: { cavWing: 'E', wings: { L: 'hold', C: 'steady', R: 'press' } } },
  envelop:  { d: { formation: 'crane', attack: 'volley', cav: 'raid' }, dep: { wings: { L: 'press', C: 'hold', R: 'press' } } },
  hold:     { d: { formation: 'line', attack: 'hold', cav: 'guard', retreatAt: 35 } },
  skirmish: { d: { formation: 'line', attack: 'waver', cav: 'free', retreatAt: 45 } },
  reserve:  { d: { formation: 'line', attack: 'volley', cav: 'raid' }, dep: { line: ['spear1', 'samurai1', 'spear2'], reserve: 'samurai2' } },
};
const N = Number(process.argv[2] || 40), rv = process.argv[3] || 'base';
const R = makeRules({ ...GAME_RULES, ...(RV[rv] ?? {}), name: rv });
console.log(`規則 ${rv}，每種 ${N} 局（武田用該策略，上杉為預設 AI）`);
for (const [name, st] of Object.entries(STRATS)) {
  let w = 0, t = 0, routs = 0, men = 0;
  for (let i = 0; i < N; i++) {
    const S: State = newState(R, 11000 + i, [CLAN_CHOICES[0][i % 3], CLAN_CHOICES[1][(i + 1) % 3]]); S.dt = SIM_DT; setup(S); S.fx = [];
    S.meta.doctrine = [{ ...DEFAULT_DOCTRINE, ...st.d }, { ...DEFAULT_DOCTRINE }];
    S.meta.deployment = [{ ...JSON.parse(JSON.stringify(DEFAULT_DEPLOY)), ...(st.dep ?? {}) }, null];
    if (st.dep?.line) { const A = (S.meta.ai as { ids: Record<string, number>; reserveId: number }[])[0]; const byKey = (k: string) => S.units.find(u => u.side === 0 && u.key === k)!; for (let k = 0; k < 4; k++) delete A.ids['line' + k]; st.dep.line.forEach((k, i) => { A.ids['line' + i] = byKey(k).id; }); if (st.dep.reserve) { const u = byKey(st.dep.reserve); u.role = 'reserve'; A.reserveId = u.id; } }
    while (!S.over) { step(S); S.fx!.length = 0; }
    if (S.over!.winner === 0) w++; t += S.over!.t; routs += S.rec.routs.filter(r => r.side === 0).length;
    men += S.units.filter(u => u.side === 0).reduce((a, u) => a + (u.state === 'gone' ? 0 : u.men), 0);
  }
  console.log(`${name.padEnd(9)} 武田勝 ${String(Math.round(w / N * 100)).padStart(3)}%  時長 ${(t / N).toFixed(0)}s  我方潰走 ${(routs / N).toFixed(1)}  終局兵力 ${(men / N).toFixed(0)}`);
}
