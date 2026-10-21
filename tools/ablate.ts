// 單一對戰組合的機制消融：node tools/ablate.ts <局數> <武田忍者眾> <上杉忍者眾> [變體…]
// 逐一關掉一項機制，看武田勝率怎麼變，用來找出某個組合失衡的來源。
import { newState, step, type State } from '../src/sim/sim.ts';
import { setup } from '../src/sim/ai.ts';
import { GAME_RULES, SIM_DT } from '../src/sim/game-rules.ts';
import { makeRules, type Rules } from '../src/sim/rules.ts';
import { CLANS } from '../src/sim/data.ts';

const V: Record<string, Partial<Rules>> = {
  base: {},
  noSahou: { offJutsu: ['sahou'] }, noKiri: { offJutsu: ['kirigakure'] }, noRumor: { offJutsu: ['rumor'] }, noMonomi: { offJutsu: ['monomi'] },
  noAnsatsu: { offJutsu: ['ansatsu'] }, noHouka: { offJutsu: ['houka'] }, noSennyu: { sennyuOn: false }, noSakuteki: { offJutsu: ['sakuteki'] },
  noCounter: { counterDeploy: false }, noFog: { fogOn: false }, noNinja: { ninjaOn: false },
  nnNoSkills: { ninjaOn: false, skillsOn: false }, nnNoStrat: { ninjaOn: false, strategyOn: false }, nnNoPassives: { ninjaOn: false, passivesOn: false }, nnNoAll: { ninjaOn: false, skillsOn: false, strategyOn: false, passivesOn: false },
  kanpa10: { kanpaDur: 10 }, kanpa15: { kanpaDur: 15 }, kits45: { kitsutsukiDur: 45 }, kanpa10kits45: { kanpaDur: 10, kitsutsukiDur: 45 },
  kogaVis115: { kogaVision: 1.15 }, kogaVis100: { kogaVision: 1.0 }, nokiHigh: { nokizaruIntel: 'high' },
  kogaN4: {}, nokiN5: {}, nokiHighN5: { nokizaruIntel: 'high' }, kogaN4Vis115: { kogaVision: 1.15 },
};
// 人數變體直接改 CLANS（模組物件可變）
const N_OVERRIDE: Record<string, [string, number]> = { kogaN4: ['koga', 4], kogaN4Vis115: ['koga', 4], nokiN5: ['nokizaru', 5], nokiHighN5: ['nokizaru', 5] };
const [n, c0, c1, ...names] = process.argv.slice(2);
const N = Number(n || 30);
for (const name of names.length ? names : Object.keys(V)) {
  const R = makeRules({ ...GAME_RULES, ...V[name], name });
  const no = N_OVERRIDE[name]; const n0 = no ? CLANS[no[0]].n : 0; if (no) CLANS[no[0]].n = no[1];
  let w = 0, t = 0;
  for (let i = 0; i < N; i++) {
    const S: State = newState(R, 7000 + i, [c0, c1]); S.dt = SIM_DT; setup(S); S.fx = [];
    while (!S.over) { step(S); S.fx!.length = 0; }
    if (S.over!.winner === 0) w++; t += S.over!.t;
  }
  if (no) CLANS[no[0]].n = n0;
  console.log(`${c0} vs ${c1} ${name.padEnd(12)} 武田勝 ${String(Math.round(w / N * 100)).padStart(3)}%  時長 ${(t / N).toFixed(0)}s`);
}
