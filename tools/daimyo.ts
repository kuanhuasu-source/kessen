// 大名模式量測：node tools/daimyo.ts <局數> [採納率 0～1，逗號分隔多組] [規則變體] [略過的建議類型，逗號分隔]
// 武田用大名模式預設方針（開戰即攻、騎兵繞後、撤退線 35、橫陣），每 3 秒跑一次軍師建議，玩家以指定機率採納（冷卻規則與遊戲相同）。
// 採納率 0 ＝ 完全不介入。輸出各採納率的勝率、每局建議張數、各類建議的出現與採納次數。
import { CLAN_CHOICES } from '../src/sim/data.ts';
import { newState, step, mulberry32, type State } from '../src/sim/sim.ts';
import { setup, issueCommand, DEFAULT_DOCTRINE, DEFAULT_DEPLOY, type CmdKind } from '../src/sim/ai.ts';
import { adviseSide, cmdBlocked, weakestEngaged, CMD_CD } from '../src/sim/advisor.ts';
import { GAME_RULES, SIM_DT } from '../src/sim/game-rules.ts';
import { makeRules, type Rules } from '../src/sim/rules.ts';

const RV: Record<string, Partial<Rules>> = { base: {}, passive: { daimyoPassive: true }, passiveCav: { daimyoPassiveCav: true },
  r2: { cmdRelieveN: 2 }, raidB: { cmdRaidCharge: 10, cmdRaidShock: -6 }, focusB: { cmdFocusMorale: -2 }, regroupB: { cmdRegroupMorale: 8 }, allB: { cmdRelieveN: 2, cmdRaidCharge: 10, cmdRaidShock: -6, cmdFocusMorale: -2, cmdRegroupMorale: 8 }, c8: { cmdCommitMorale: 8 }, ch5: { cmdChargeMorale: 5 }, both: { cmdCommitMorale: 8, cmdChargeMorale: 5 }, c12: { cmdCommitMorale: 12 }, ch8: { cmdChargeMorale: 8 } };
const N = Number(process.argv[2] || 60);
const rates = (process.argv[3] || '0,0.5,1').split(',').map(Number);
const rv = process.argv[4] || 'base';
const skip = new Set((process.argv[5] || '').split(',').filter(Boolean)); // 這些類型的建議不出現（消融用）
const R = makeRules({ ...GAME_RULES, ...(RV[rv] ?? {}), name: rv });
const kindOf = (id: string) => id.split(':')[0];
console.log(`規則 ${rv}，每組 ${N} 局（武田大名模式預設方針，上杉為預設 AI）${skip.size ? `，略過 ${[...skip].join('、')}` : ''}`);
for (const p of rates) {
  let w = 0, t = 0, shown = 0, taken = 0; const byKind: Record<string, { shown: number; taken: number }> = {};
  for (let i = 0; i < N; i++) {
    const S: State = newState(R, 21000 + i, [CLAN_CHOICES[0][i % 3], CLAN_CHOICES[1][(i + 1) % 3]]); S.dt = SIM_DT; setup(S); S.fx = [];
    S.meta.doctrine = [{ ...DEFAULT_DOCTRINE, attack: (process.env.ATTACK as 'auto' | 'now' | 'volley') || 'auto', cav: 'raid', retreatAt: 35, formation: 'line' }, { ...DEFAULT_DOCTRINE }]; // 大名模式預設方針（ATTACK=now|volley 可改）
    S.meta.deployment = [JSON.parse(JSON.stringify(DEFAULT_DEPLOY)), null];
    S.meta.playerSide = 0;
    const rng = mulberry32(777 + i);
    const cmdCd: Partial<Record<CmdKind, number>> = {}; const adviceCd: Record<string, number> = {}; let adviceT = -99;
    while (!S.over) {
      step(S); S.fx!.length = 0;
      if (p > 0 && S.t - adviceT >= 3) {
        adviceT = S.t;
        const ok = (id: string, k: CmdKind) => !skip.has(kindOf(id)) && !((adviceCd[id] ?? 0) > S.t) && !cmdBlocked(S, 0, k, cmdCd);
        const a = adviseSide(S, 0, ok); if (!a) continue;
        shown++; const b = byKind[kindOf(a.id)] ??= { shown: 0, taken: 0 }; b.shown++;
        if (rng() < p) {
          const target = a.cmd === 'relieve' && a.target === undefined ? weakestEngaged(S, 0)!.id : a.target;
          if (issueCommand(S, 0, a.cmd, target)) { cmdCd[a.cmd] = S.t + CMD_CD[a.cmd] * Number(process.env.CD || 1); taken++; b.taken++; } // CD=0.33 可試縮短冷卻
          adviceCd[a.id] = S.t + 120;
        } else adviceCd[a.id] = S.t + 90;
      }
    }
    if (S.over!.winner === 0) w++; t += S.over!.t;
  }
  const kinds = Object.entries(byKind).map(([k, v]) => `${k} ${(v.shown / N).toFixed(1)}/${(v.taken / N).toFixed(1)}`).join('、');
  console.log(`採納 ${String(Math.round(p * 100)).padStart(3)}%  武田勝 ${String(Math.round(w / N * 100)).padStart(3)}%  時長 ${(t / N).toFixed(0)}s  建議 ${(shown / N).toFixed(1)} 張/局、採納 ${(taken / N).toFixed(1)}${kinds ? `  （出現/採納：${kinds}）` : ''}`);
}
