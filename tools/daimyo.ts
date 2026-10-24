// 大名模式量測：node tools/daimyo.ts <局數> [採納率 0～1，逗號分隔多組] [規則變體] [略過的建議類型，逗號分隔]
// 武田用大名模式預設方針（開戰即攻、騎兵繞後、撤退線 35、橫陣），每 3 秒跑一次軍師建議，玩家以指定機率採納（冷卻規則與遊戲相同）。
// 採納率 0 ＝ 完全不介入。輸出各採納率的勝率、每局建議張數、各類建議的出現與採納次數。
import { CLAN_CHOICES } from '../src/sim/data.ts';
import { newState, step, mulberry32, type State } from '../src/sim/sim.ts';
import { setup, issueCommand, DEFAULT_DOCTRINE, DEFAULT_DEPLOY, type CmdKind } from '../src/sim/ai.ts';
import { adviseSide, cmdBlocked, weakestEngaged, CMD_CD, dispatchScouts } from '../src/sim/advisor.ts';
import { evalDecision, applyDecision, tickDecisions } from '../src/sim/decisions.ts';
import { GAME_RULES, SIM_DT } from '../src/sim/game-rules.ts';
import { makeRules, type Rules } from '../src/sim/rules.ts';

const RV: Record<string, Partial<Rules>> = { base: {}, passive: { daimyoPassive: true }, passiveCav: { daimyoPassiveCav: true },
  r2: { cmdRelieveN: 2 }, raidB: { cmdRaidCharge: 10, cmdRaidShock: -6 }, focusB: { cmdFocusMorale: -2 }, regroupB: { cmdRegroupMorale: 8 }, allB: { cmdRelieveN: 2, cmdRaidCharge: 10, cmdRaidShock: -6, cmdFocusMorale: -2, cmdRegroupMorale: 8 },
  midB: { cmdRelieveN: 2, cmdRaidCharge: 12, cmdRaidShock: -10, cmdFocusMorale: -4, cmdFocusHit: 1.3, cmdRegroupMorale: 8 }, strongB: { cmdRelieveN: 2, cmdRaidCharge: 15, cmdRaidShock: -15, cmdFocusMorale: -6, cmdFocusHit: 1.6, cmdRegroupMorale: 12 }, c8: { cmdCommitMorale: 8 }, ch5: { cmdChargeMorale: 5 }, both: { cmdCommitMorale: 8, cmdChargeMorale: 5 }, c12: { cmdCommitMorale: 12 }, ch8: { cmdChargeMorale: 8 },
  m1: { detachOn: false, fogDur: 0 }, noFog: { fogDur: 0 }, noDet: { detachOn: false }, d150: { detachT0: 150 }, d120: { detachT0: 120 }, f90: { fogDur: 90 }, f60: { fogDur: 60 }, d150f90: { detachT0: 150, fogDur: 90 }, d120f90: { detachT0: 120, fogDur: 90 }, d120f60: { detachT0: 120, fogDur: 60 }, d150f60: { detachT0: 150, fogDur: 60 },
  d190u90: { detachT0: 190, menMul: [1, 0.9] }, d190det150: { detachT0: 190, menMulDetach: 1.5 }, d190t110: { detachT0: 190, menMul: [1.1, 1] }, d190det150u110: { detachT0: 190, menMulDetach: 1.5, menMul: [1, 1.1] }, d190det200u120: { detachT0: 190, menMulDetach: 2, menMul: [1, 1.2] }, d190det200u130: { detachT0: 190, menMulDetach: 2, menMul: [1, 1.3] },
  gap30: { decGapEvent: 30 }, gap40: { decGapEvent: 40 }, cdx2: { decCdMul: 2 }, gap30cdx2: { decGapEvent: 30, decCdMul: 2 }, gap40cdx2: { decGapEvent: 40, decCdMul: 2 }, gap30d60: { decGapEvent: 30, decGapDoctrine: 60 } };
const N = Number(process.argv[2] || 60);
const rates = (process.argv[3] || '0,0.5,1').split(',').map(Number);
const MODE = process.env.MODE || 'dec';
const optStat: Record<string, { n: number; w: number }> = {}; // MODE=stat：隨機選項，統計每張卡每個選項的勝率（有混淆，但能看出哪些選項根本沒差） // dec＝決策卡（p＝選軍師建議的機率，其餘隨機；p<0 不問）；adv＝舊建議卡
const rv = process.argv[4] || 'base';
const skip = new Set((process.argv[5] || '').split(',').filter(Boolean)); // 這些類型的建議不出現（消融用）
const R = makeRules({ ...GAME_RULES, ...(RV[rv] ?? {}), name: rv });
const kindOf = (id: string) => id.startsWith('doc:') || id.startsWith('ev:') ? id.split(':').slice(0, 2).join(':') : id.split(':')[0];
console.log(`規則 ${rv}，每組 ${N} 局（武田大名模式預設方針，上杉為預設 AI）${skip.size ? `，略過 ${[...skip].join('、')}` : ''}`);
for (const p of rates) {
  let w = 0, t = 0, shown = 0, taken = 0, id120 = 0, id180 = 0; const byKind: Record<string, { shown: number; taken: number }> = {};
  for (let i = 0; i < N; i++) {
    const S: State = newState(R, 21000 + i, [CLAN_CHOICES[0][i % 3], CLAN_CHOICES[1][(i + 1) % 3]]); S.dt = SIM_DT; setup(S); S.fx = [];
    S.meta.doctrine = [{ ...DEFAULT_DOCTRINE, attack: (process.env.ATTACK as 'auto' | 'now' | 'volley') || 'volley', cav: 'raid', retreatAt: 35, formation: 'line' }, { ...DEFAULT_DOCTRINE }]; // 大名模式預設方針（射完箭再攻；ATTACK=now|auto 可改）
    S.meta.deployment = [JSON.parse(JSON.stringify(DEFAULT_DEPLOY)), null];
    S.meta.playerSide = 0;
    const rng = mulberry32(777 + i);
    const cmdCd: Partial<Record<CmdKind, number>> = {}; const adviceCd: Record<string, number> = {}; let adviceT = -99; const picksThisGame: string[] = [];
    let s120 = -1, s180 = -1;
    const idf = () => { const en = S.units.filter(u => u.side === 1 && u.state !== 'gone' && !u.reinf); return en.filter(u => S.vis[0][u.id] >= 2).length / Math.max(1, en.length); };
    while (!S.over) {
      step(S); S.fx!.length = 0;
      if (s120 < 0 && S.t >= 120) s120 = idf(); if (s180 < 0 && S.t >= 180) s180 = idf();
      if (MODE === 'dec') {
        if (p >= 0 && S.t - adviceT >= 0.5) { adviceT = S.t; tickDecisions(S, 0); const d = evalDecision(S, 0); if (d) { shown++; const b = byKind[kindOf(d.id)] ??= { shown: 0, taken: 0 }; b.shown++; const rec = d.options.find(o => o.rec) ?? d.options[0]; const o = rng() < p ? rec : d.options[Math.floor(rng() * d.options.length)]; if (o === rec) { taken++; b.taken++; } applyDecision(S, 0, d, o.id); picksThisGame.push(`${kindOf(d.id)} ${o.id}${o === rec ? '*' : ''}`); } }
        continue;
      }
      if (p > 0 && S.t - adviceT >= 3) {
        adviceT = S.t;
        const ok = (id: string, k?: CmdKind) => !skip.has(kindOf(id)) && !((adviceCd[id] ?? 0) > S.t) && (!k || !cmdBlocked(S, 0, k, cmdCd));
        const a = adviseSide(S, 0, ok); if (!a) continue;
        shown++; const b = byKind[kindOf(a.id)] ??= { shown: 0, taken: 0 }; b.shown++;
        if (rng() < p) {
          const target = a.cmd === 'relieve' && a.target === undefined ? weakestEngaged(S, 0)!.id : a.target;
          if (a.act === 'scout') { dispatchScouts(S, 0); taken++; b.taken++; }
          else if (a.cmd && issueCommand(S, 0, a.cmd, target)) { cmdCd[a.cmd] = S.t + CMD_CD[a.cmd] * Number(process.env.CD || 1); taken++; b.taken++; } // CD=0.33 可試縮短冷卻
          adviceCd[a.id] = S.t + 120;
        } else adviceCd[a.id] = S.t + 90;
      }
    }
    for (const k of new Set(picksThisGame)) { const o = optStat[k] ??= { n: 0, w: 0 }; o.n++; if (S.over!.winner === 0) o.w++; }
    if (S.over!.winner === 0) w++; t += S.over!.t; id120 += s120 < 0 ? idf() : s120; id180 += s180 < 0 ? (s120 < 0 ? idf() : s120) : s180;
  }
  if (process.env.STAT) { console.log('  選項統計（出現局數 → 該局勝率；* 為軍師建議）：'); for (const [k, v] of Object.entries(optStat).sort()) if (v.n >= 10) console.log(`    ${k.padEnd(24)} ${String(v.n).padStart(4)} 局  ${Math.round(v.w / v.n * 100)}%`); }
  const kinds = Object.entries(byKind).map(([k, v]) => `${k} ${(v.shown / N).toFixed(1)}/${(v.taken / N).toFixed(1)}`).join('、');
  console.log(`採納 ${String(Math.round(p * 100)).padStart(3)}%  武田勝 ${String(Math.round(w / N * 100)).padStart(3)}%  時長 ${(t / N).toFixed(0)}s  識別 120s ${(id120 / N * 100).toFixed(0)}% 180s ${(id180 / N * 100).toFixed(0)}%  建議 ${(shown / N).toFixed(1)} 張/局、採納 ${(taken / N).toFixed(1)}${kinds ? `  （出現/採納：${kinds}）` : ''}`);
}
