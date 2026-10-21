// 單一對戰組合的機制消融：node tools/ablate.ts <局數> <武田忍者眾> <上杉忍者眾> [變體…]
// 逐一關掉一項機制，看武田勝率怎麼變，用來找出某個組合失衡的來源。
import { newState, step, type State } from '../src/sim/sim.ts';
import { setup } from '../src/sim/ai.ts';
import { GAME_RULES, SIM_DT } from '../src/sim/game-rules.ts';
import { makeRules, type Rules } from '../src/sim/rules.ts';

const V: Record<string, Partial<Rules>> = {
  base: {},
  noSahou: { offJutsu: ['sahou'] }, noKiri: { offJutsu: ['kirigakure'] }, noRumor: { offJutsu: ['rumor'] }, noMonomi: { offJutsu: ['monomi'] },
  noAnsatsu: { offJutsu: ['ansatsu'] }, noHouka: { offJutsu: ['houka'] }, noSennyu: { sennyuOn: false }, noSakuteki: { offJutsu: ['sakuteki'] },
  noCounter: { counterDeploy: false }, noFog: { fogOn: false }, noNinja: { ninjaOn: false },
};
const [n, c0, c1, ...names] = process.argv.slice(2);
const N = Number(n || 30);
for (const name of names.length ? names : Object.keys(V)) {
  const R = makeRules({ ...GAME_RULES, ...V[name], name });
  let w = 0, t = 0;
  for (let i = 0; i < N; i++) {
    const S: State = newState(R, 7000 + i, [c0, c1]); S.dt = SIM_DT; setup(S); S.fx = [];
    while (!S.over) { step(S); S.fx!.length = 0; }
    if (S.over!.winner === 0) w++; t += S.over!.t;
  }
  console.log(`${c0} vs ${c1} ${name.padEnd(10)} 武田勝 ${String(Math.round(w / N * 100)).padStart(3)}%  時長 ${(t / N).toFixed(0)}s`);
}
