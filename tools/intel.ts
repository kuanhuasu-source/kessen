// 情報掌握曲線：node tools/intel.ts <局數> [變體]
// 武田方（side 0）對敵軍 8 隊的察覺／識別／洞悉比例，以及地形秘密已知比例，隨時間的平均值。
import { CLAN_CHOICES } from '../src/sim/data.ts';
import { newState, step, onField, type State } from '../src/sim/sim.ts';
import { setup } from '../src/sim/ai.ts';
import { GAME_RULES, SIM_DT } from '../src/sim/game-rules.ts';
import { makeRules, type Rules } from '../src/sim/rules.ts';

const V: Record<string, Partial<Rules>> = { base: {}, fog2: { fogV2: true } as Partial<Rules> };
const n = Number(process.argv[2] || 20), name = process.argv[3] || 'base';
const R = makeRules({ ...GAME_RULES, ...(V[name] ?? {}), name });
const T = [10, 30, 60, 90, 120, 180, 240, 300, 360];
const acc = T.map(() => ({ l1: 0, l2: 0, l3: 0, sec: 0, n: 0 }));
let full1 = 0, full2 = 0, c1 = 0, c2 = 0;
for (let i = 0; i < n; i++) {
  const pre = Math.floor(i / 3) % 3; // 輪流用三家忍者眾
  const S: State = newState(R, 9000 + i, [CLAN_CHOICES[0][pre], CLAN_CHOICES[1][i % 3]]); S.dt = SIM_DT; setup(S); S.fx = [];
  let f1 = -1, f2 = -1; let k = 0;
  const nSec = S.secrets.marsh.length + S.secrets.ambush.length + 1;
  while (!S.over && S.t <= 361) {
    step(S); S.fx!.length = 0;
    const en = S.units.filter(u => u.side === 1 && onField(u) && !u.reinf);
    const l1 = en.filter(u => S.vis[0][u.id] >= 1).length / en.length, l2 = en.filter(u => S.vis[0][u.id] >= 2).length / en.length, l3 = en.filter(u => S.vis[0][u.id] >= 3).length / en.length;
    if (f1 < 0 && l1 >= 0.999) f1 = S.t; if (f2 < 0 && l2 >= 0.999) f2 = S.t;
    if (k < T.length && S.t >= T[k]) { const a = acc[k]; a.l1 += l1; a.l2 += l2; a.l3 += l3; a.sec += S.known[0].size / nSec; a.n++; k++; }
  }
  if (f1 >= 0) { full1 += f1; c1++; } if (f2 >= 0) { full2 += f2; c2++; }
}
console.log(`${name}：武田方對上杉 8 隊的情報比例（平均 ${n} 局）`);
console.log('時間   察覺≥1  識別≥2  洞悉=3  地形秘密');
for (let k = 0; k < T.length; k++) { const a = acc[k]; if (!a.n) continue; console.log(`${String(T[k]).padStart(3)}s   ${(a.l1 / a.n * 100).toFixed(0).padStart(4)}%   ${(a.l2 / a.n * 100).toFixed(0).padStart(4)}%   ${(a.l3 / a.n * 100).toFixed(0).padStart(4)}%   ${(a.sec / a.n * 100).toFixed(0).padStart(4)}%`); }
console.log(`全部察覺的局 ${Math.round(c1 / n * 100)}%，平均在 ${c1 ? (full1 / c1).toFixed(0) : '-'} 秒；全部識別的局 ${Math.round(c2 / n * 100)}%，平均在 ${c2 ? (full2 / c2).toFixed(0) : '-'} 秒`);
