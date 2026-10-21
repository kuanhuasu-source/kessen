// 忍者眾對戰矩陣與逆轉率：node tools/matrix.ts <每組局數>
// 武田 3 家 × 上杉 3 家，各跑 N 局；另算「開戰 3 分鐘軍勢落後 15 以上仍翻盤」的比例與每局模擬步耗時。
import { CLAN_CHOICES } from '../src/sim/data.ts';
import { newState, step, type State } from '../src/sim/sim.ts';
import { setup } from '../src/sim/ai.ts';
import { GAME_RULES, SIM_DT } from '../src/sim/game-rules.ts';

const n = Number(process.argv[2] || 20);
let steps = 0, ms = 0, comebacks = 0, behind = 0;
function one(c0: string, c1: string, seed: number) {
  const S: State = newState(GAME_RULES, seed, [c0, c1]);
  S.dt = SIM_DT; setup(S); S.fx = [];
  let lag: -1 | 0 | 1 = -1;
  const t0 = performance.now();
  while (!S.over) {
    step(S); S.fx!.length = 0; steps++;
    if (lag < 0 && S.t >= 180) lag = S.army[0] + 15 <= S.army[1] ? 0 : S.army[1] + 15 <= S.army[0] ? 1 : -1;
  }
  ms += performance.now() - t0;
  if (lag >= 0) { behind++; if (S.over!.winner === lag) comebacks++; }
  return S.over!;
}
console.log('武田＼上杉'.padEnd(10) + CLAN_CHOICES[1].map(c => c.padEnd(12)).join(''));
const tot: Record<string, { w: number; n: number }> = {};
for (const c0 of CLAN_CHOICES[0]) {
  const row: string[] = [];
  for (const c1 of CLAN_CHOICES[1]) {
    let w = 0, t = 0;
    for (let i = 0; i < n; i++) { const o = one(c0, c1, 5000 + i); if (o.winner === 0) w++; t += o.t; }
    row.push(`${Math.round(w / n * 100)}% ${(t / n).toFixed(0)}s`.padEnd(12));
    tot[c0] = { w: (tot[c0]?.w ?? 0) + w, n: (tot[c0]?.n ?? 0) + n }; tot[c1] = { w: (tot[c1]?.w ?? 0) + (n - w), n: (tot[c1]?.n ?? 0) + n };
  }
  console.log(c0.padEnd(10) + row.join(''));
}
console.log('各忍者眾總勝率：' + Object.entries(tot).map(([k, v]) => `${k} ${Math.round(v.w / v.n * 100)}%`).join('、'));
console.log(`逆轉率：3 分鐘落後 15 以上的 ${behind} 局中翻盤 ${comebacks} 局（${behind ? Math.round(comebacks / behind * 100) : 0}%）；落後局佔 ${Math.round(behind / (n * 9) * 100)}%`);
console.log(`模擬成本：每步 ${(ms / steps).toFixed(3)} ms（${steps} 步）；3× 速度每秒 30 步 ≈ ${(ms / steps * 30).toFixed(1)} ms/s`);
