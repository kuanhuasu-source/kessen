// AI 行為診斷：node tools/ai-diag.ts <局數>
// 量「看起來怪」的行為：目標切換、目的地反轉（急轉回頭）、弓兵來回挪、騎兵退衝循環、主將改道、
// 戰線散開程度、部隊落單（最近友軍 > 80 m）、接戰前的平均「無方向」時間。
import { CLAN_CHOICES } from '../src/sim/data.ts';
import { newState, step, mulberry32, active, type State, type Unit } from '../src/sim/sim.ts';
import { setup } from '../src/sim/ai.ts';
import { GAME_RULES, SIM_DT } from '../src/sim/game-rules.ts';
import { makeRules } from '../src/sim/rules.ts';

type Per = { tgtSw: number; rev: number; destJump: number; alone: number; move: number; idle: number };
function one(seed: number, verbose: boolean) {
  const pre = mulberry32(seed * 7919 + 13);
  const clan: [string, string] = [CLAN_CHOICES[0][Math.floor(pre() * 3)], CLAN_CHOICES[1][Math.floor(pre() * 3)]];
  const S: State = newState(makeRules({ ...GAME_RULES, ...(process.argv[3] === 'steady' ? { aiSteady: true } : {}), name: 'diag' }), seed, clan);
  S.dt = SIM_DT; setup(S); S.fx = [];
  const per = new Map<number, Per>();
  const lastTgt = new Map<number, number>(), lastDest = new Map<number, [number, number]>(), lastDir = new Map<number, [number, number, number]>();
  let cavCycles = 0, lineSpread = 0, spreadN = 0, firstContact = -1;
  const lastCav = new Map<number, string>();
  const byType: Record<string, Per> = {};
  const P = (u: Unit) => { let p = per.get(u.id); if (!p) { p = { tgtSw: 0, rev: 0, destJump: 0, alone: 0, move: 0, idle: 0 }; per.set(u.id, p); } return p; };
  const log: string[] = [];
  while (!S.over) {
    const prev = new Map<number, [number, number]>();
    for (const u of S.units) prev.set(u.id, [u.x, u.y]);
    step(S); S.fx!.length = 0;
    const t = S.t;
    for (const u of S.units) {
      if (!active(u) || u.reinf) continue;
      const p = P(u);
      if (u.contacts.length && firstContact < 0) firstContact = t;
      // 目標切換（只算接戰前／未接戰時）
      const lt = lastTgt.get(u.id) ?? -1;
      if (u.target !== lt) { if (lt >= 0 && u.target >= 0 && !u.contacts.length) { p.tgtSw++; if (verbose && u.side === 1) log.push(`${t.toFixed(0)}s ${u.cmd} 改目標 ${S.units[lt]?.cmd} → ${S.units[u.target]?.cmd}`); } lastTgt.set(u.id, u.target); }
      // 目的地大跳（新目的地與舊目的地差 > 100 m）
      if (u.hasDest) {
        const ld = lastDest.get(u.id);
        if (ld && Math.hypot(u.destX - ld[0], u.destY - ld[1]) > 100) { p.destJump++; if (verbose && u.side === 1 && !u.contacts.length) log.push(`${t.toFixed(0)}s ${u.cmd} 目的地跳 ${Math.hypot(u.destX - ld[0], u.destY - ld[1]).toFixed(0)} m`); }
        lastDest.set(u.id, [u.destX, u.destY]);
      }
      // 移動方向反轉：3 秒內移動方向改變 > 120°
      const q = prev.get(u.id)!; const dx = u.x - q[0], dy = u.y - q[1], d = Math.hypot(dx, dy);
      if (d > 0.05) {
        p.move += S.dt;
        const ld = lastDir.get(u.id);
        if (ld && t - ld[2] < 3) { const dot = (dx * ld[0] + dy * ld[1]) / (d * Math.hypot(ld[0], ld[1])); if (dot < -0.5) { p.rev++; lastDir.set(u.id, [dx, dy, t - 10]); if (verbose && u.side === 1 && !u.contacts.length) log.push(`${t.toFixed(0)}s ${u.cmd} 回頭`); } else lastDir.set(u.id, [dx, dy, t]); }
        else lastDir.set(u.id, [dx, dy, t]);
      } else if (!u.contacts.length && t > 10) p.idle += S.dt;
      // 落單
      let nf = 1e9;
      for (const v of S.units) if (v !== u && v.side === u.side && active(v)) nf = Math.min(nf, Math.hypot(v.x - u.x, v.y - u.y));
      if (nf > 80 && u.type !== 'cav') p.alone += S.dt;
      // 騎兵退衝
      if (u.type === 'cav') { const lc = lastCav.get(u.id); if (lc !== u.cavPhase) { if (u.cavPhase === 'withdraw') cavCycles++; lastCav.set(u.id, u.cavPhase); } }
    }
    // 戰線散開：每方 line 角色（長槍、武士）y 的標準差（未接戰時）
    if (Math.round(t * 10) % 50 === 0) for (const s of [0, 1]) {
      const ls = S.units.filter(u => u.side === s && active(u) && (u.type === 'spear' || u.type === 'samurai') && !u.contacts.length);
      if (ls.length >= 3) { const my = ls.reduce((a, u) => a + u.y, 0) / ls.length; lineSpread += Math.sqrt(ls.reduce((a, u) => a + (u.y - my) ** 2, 0) / ls.length); spreadN++; }
    }
  }
  for (const u of S.units) { if (u.reinf) continue; const p = per.get(u.id); if (!p) continue; const k = u.type; const b = byType[k] ??= { tgtSw: 0, rev: 0, destJump: 0, alone: 0, move: 0, idle: 0 }; for (const key of Object.keys(p) as (keyof Per)[]) b[key] += p[key]; }
  return { t: S.over!.t, first: firstContact, byType, cavCycles, spread: spreadN ? lineSpread / spreadN : 0, log };
}

const n = Number(process.argv[2] || 20);
const rs = Array.from({ length: n }, (_, i) => one(1000 + i, i === 0));
const types = ['spear', 'samurai', 'archer', 'cav', 'general'];
const cnt: Record<string, number> = { spear: 4, samurai: 4, archer: 4, cav: 2, general: 2 };
console.log(`局數 ${n}，平均時長 ${(rs.reduce((a, r) => a + r.t, 0) / n).toFixed(0)}s，首戰 ${(rs.reduce((a, r) => a + r.first, 0) / n).toFixed(0)}s，騎兵退衝循環 ${(rs.reduce((a, r) => a + r.cavCycles, 0) / n).toFixed(1)} 次/局，戰線 y 散開 ${(rs.reduce((a, r) => a + r.spread, 0) / n).toFixed(0)} m`);
console.log('每隊每局：目標切換 / 目的地大跳 / 回頭 / 落單秒 / 移動秒 / 待機秒');
for (const k of types) {
  const f = (key: keyof Per) => (rs.reduce((a, r) => a + (r.byType[k]?.[key] ?? 0), 0) / n / cnt[k]).toFixed(1);
  console.log(`${k.padEnd(8)} ${f('tgtSw').padStart(6)} ${f('destJump').padStart(6)} ${f('rev').padStart(6)} ${f('alone').padStart(7)} ${f('move').padStart(7)} ${f('idle').padStart(7)}`);
}
console.log('\n第一局上杉軍（AI）事件摘要（前 60 行）：'); console.log(rs[0].log.slice(0, 60).join('\n'));
