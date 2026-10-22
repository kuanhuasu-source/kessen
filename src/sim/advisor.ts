// 軍師建議（大名模式）：依「我方看得到的情報」評估，一次給一張卡（建議＋對應的大名令）。
// 放在模擬層是為了能無頭量測（tools/daimyo.ts）：遊戲層（main.ts）與量測工具用同一套規則。
import type { Side } from './data.ts';
import { type State, type Unit, active, dist, effM, general, isRanged, archerRange, inWater, canSee } from './sim.ts';
import { type CmdKind, cmdOf } from './ai.ts';

export type Advice = { id: string; text: string; cmd: CmdKind; target?: number };
export const CMD_CD: Record<CmdKind, number> = { charge: 90, regroup: 60, relieve: 30, focus: 30, commit: 90, raid: 45 }; // 大名令冷卻（秒）
export const unitName = (u: Unit) => `${u.cmd || '援軍'}隊`;
// 我方對某敵隊的情報等級：0 未知、1 察覺、2 識別、3 洞悉（忍者洞悉或看破）
export function intelLvl(S: State, s: Side, E: Unit) {
  if (!S.R.fogOn || E.side === s) return 3;
  return Math.max(S.vis[s][E.id], canSee(S, s, E) ? 2 : 0);
}
// 接戰中士氣最低的我方部隊（主將除外）
export function weakestEngaged(S: State, s: Side): Unit | null {
  let w: Unit | null = null, wm = 101;
  for (const u of S.units) if (u.side === s && active(u) && u.contacts.length && u.type !== 'general') { const m = effM(S, u); if (m < wm) { wm = m; w = u; } }
  return w;
}
// 某道大名令目前不能下的原因（空字串＝可以）；cd 是遊戲層的冷卻表
export function cmdBlocked(S: State, s: Side, k: CmdKind, cd: Partial<Record<CmdKind, number>>): string {
  if ((cd[k] ?? 0) > S.t) return `冷卻中（${Math.ceil(cd[k]! - S.t)} 秒）`;
  const c = cmdOf(S, s); if (c && c.kind === k) return `執行中（${Math.ceil(c.until - S.t)} 秒）`;
  const g = general(S, s);
  if (k === 'commit' && (!g.cmdAlive || !active(g))) return '主將不在';
  if (k === 'relieve' && !weakestEngaged(S, s)) return '沒有接戰中的友軍';
  if (k === 'raid' && !S.units.some(u => u.side === s && u.type === 'cav' && active(u))) return '騎兵不在';
  return '';
}
// 評估建議。ok(id, cmd)：這條建議沒在冷卻、且對應的大名令目前可下。回傳優先順序最高的一條
export function adviseSide(S: State, s: Side, ok: (id: string, k: CmdKind) => boolean): Advice | null {
  const e = (1 - s) as Side;
  const g = general(S, s);
  const own = S.units.filter(u => u.side === s && active(u));
  const lvl = (E: Unit) => intelLvl(S, s, E);
  const seen = S.units.filter(u => u.side === e && active(u) && lvl(u) >= 2);
  const spotted = S.units.filter(u => u.side === e && active(u) && lvl(u) >= 1);
  const cands: Advice[] = [];
  const push = (id: string, text: string, cmd: CmdKind, target?: number) => { if (ok(id, cmd)) cands.push({ id, text, cmd, target }); };
  const guarded = (E: Unit) => seen.some(X => X.type === 'spear' && !X.contacts.length && dist(X, E) < 60);
  // 1. 友軍動搖且有人能去幫
  const weak = weakestEngaged(S, s);
  if (weak && effM(S, weak) < 50 && own.some(u => u !== weak && !u.contacts.length && !u.retreating && (u.type === 'spear' || u.type === 'samurai' || u.type === 'cav')))
    push('relieve:' + weak.id, `${unitName(weak)}動搖了，派空手的部隊從側背打它的對手。`, 'relieve', weak.id);
  // 2. 敵軍半渡：察覺到的敵軍正在涉水，而且離我方空手的戰線部隊不遠 → 半渡而擊
  if (S.R.streams !== 'none') {
    const wading = spotted.filter(E => inWater(S, E.x, E.y) === 1 && own.some(u => !u.contacts.length && (u.type === 'spear' || u.type === 'samurai') && dist(u, E) < 140));
    if (wading.length >= 2) push('ford', `敵軍 ${wading.length} 隊正在涉水，半渡而擊！全軍壓上。`, 'charge');
  }
  // 3. 敵遠程部隊沒有長槍掩護：大筒優先（60 m 內打不到人，最怕騎兵）
  const cav = own.find(u => u.type === 'cav' && !u.contacts.length);
  if (cav) {
    const ea = seen.filter(E => isRanged(E) && dist(cav, E) < 260 && !guarded(E)).sort((a, b) => (a.type === 'cannon' ? -1 : 0) - (b.type === 'cannon' ? -1 : 0) || dist(a, cav) - dist(b, cav))[0];
    if (ea) push('raid:' + ea.id, ea.type === 'cannon' ? `敵大筒${unitName(ea)}現身了，沒有長槍護衛；大筒 60 m 內打不到人，讓騎兵繞到背後衝鋒。`
      : `敵${unitName(ea)}${ea.type === 'gun' ? '鐵砲' : '弓兵'}沒有長槍掩護，讓騎兵繞到背後衝鋒。`, 'raid', ea.id);
  }
  // 4. 敵軍動搖：集中弓火
  const wav = seen.filter(E => (E.state === 'waver' || lvl(E) >= 3 && effM(S, E) < 50) && own.some(u => isRanged(u) && active(u) && dist(u, E) <= archerRange(S, u, E))).sort((a, b) => effM(S, a) - effM(S, b))[0];
  if (wav) push('focus:' + wav.id, `敵${unitName(wav)}士氣動搖，弓兵集火就能逼它潰走。`, 'focus', wav.id);
  // 5. 主將親征：主將附近有僵持中的近戰，敵隊已動搖（或士氣比我隊低）→ 旗本側面一衝就垮；敵主將孤立也算
  const eg = general(S, e);
  if (g.cmdAlive && active(g) && effM(S, g) >= 60) {
    const tgt = seen.filter(E => E.contacts.length && dist(g, E) < 150 && E.type !== 'cav' && (E.state === 'waver' || effM(S, E) < 55))
      .map(E => ({ E, mine: E.contacts.map(id => S.units[id]).filter(u => u.side === s && active(u)).sort((a, b) => effM(S, a) - effM(S, b))[0] }))
      .filter(x => x.mine && effM(S, x.mine) < 70).sort((a, b) => effM(S, a.E) - effM(S, b.E))[0];
    if (tgt) push('commit:' + tgt.E.id, `${unitName(tgt.mine!)}正與敵${unitName(tgt.E)}僵持，敵隊已動搖，主公親率旗本從側面衝一下就垮了。`, 'commit');
    else if (eg.cmdAlive && active(eg) && lvl(eg) >= 2 && dist(g, eg) < 200 && !guarded(eg))
      push('commit', `敵主將${eg.cmd}身邊沒有長槍，主公可親率旗本直取。`, 'commit');
  }
  // 6. 全軍突擊：敵軍已有人動搖或潰走、我方軍勢不落後 → 壓上引發連鎖潰逃；敵軍勢很低也算。我方軍勢不利：整頓
  const routing = seen.filter(E => E.state === 'rout').length, wavering = seen.filter(E => E.state === 'waver').length;
  if (S.t > 60 && wavering + 2 * routing >= 2 && S.army[s] >= S.army[e] - 5 && own.some(u => u.contacts.length))
    push('charge', `敵軍 ${wavering} 隊動搖、${routing} 隊潰走，全軍壓上可引發連鎖潰逃。`, 'charge');
  else if (S.army[e] < 40) push('charge', `敵軍勢只剩 ${Math.round(S.army[e])}，全軍壓上可一舉擊潰。`, 'charge');
  if (S.army[s] < 50 && S.army[e] > S.army[s] + 15 && own.filter(u => u.contacts.length).length >= 2) push('regroup', `我軍軍勢 ${Math.round(S.army[s])} 落後，先整頓戰線，別讓潰走連鎖。`, 'regroup');
  return cands[0] ?? null;
}
