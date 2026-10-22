// 軍師建議（大名模式）：依「我方看得到的情報」評估，一次給一張卡（建議＋對應的大名令）。
// 放在模擬層是為了能無頭量測（tools/daimyo.ts）：遊戲層（main.ts）與量測工具用同一套規則。
import type { Side } from './data.ts';
import { type State, type Unit, active, dist, effM, general, isRanged, archerRange, canSee } from './sim.ts';
import { type CmdKind, cmdOf } from './ai.ts';

export type Advice = { id: string; text: string; cmd?: CmdKind; target?: number; act?: 'scout' }; // cmd：對應的大名令；act：不帶令的動作（派忍者偵察）
const Yl = (side: Side, y: number) => side === 0 ? y : 700 - y;
// 派忍者偵察：還活著且沒被發現的忍者分散到敵線前 40 m（己方座標 400），45 秒後交回自動
export function dispatchScouts(S: State, s: Side) {
  const xs = [500, 300, 700, 400, 600]; let i = 0, n = 0;
  for (const nj of S.ninjas) if (nj.side === s && nj.alive && nj.detUntil <= S.t) { nj.manual = true; nj.tx = xs[i++ % xs.length]; nj.ty = Yl(s, 400); nj.autoAt = S.t + 45; n++; }
  return n;
}
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
// 評估建議（四類：馳援、騎兵繞後、集中弓火、整頓）。ok(id, cmd)：這條建議沒在冷卻、且對應的大名令目前可下。回傳優先順序最高的一條
export function adviseSide(S: State, s: Side, ok: (id: string, k?: CmdKind) => boolean): Advice | null {
  const e = (1 - s) as Side;
  const own = S.units.filter(u => u.side === s && active(u));
  const lvl = (E: Unit) => intelLvl(S, s, E);
  const seen = S.units.filter(u => u.side === e && active(u) && lvl(u) >= 2);
  const cands: Advice[] = [];
  const push = (id: string, text: string, cmd: CmdKind, target?: number) => { if (ok(id, cmd)) cands.push({ id, text, cmd, target }); };
  // 0. 情報不足（開戰 30～180 秒、識別的敵軍 ≤2 隊、還有 2 個以上可用忍者）：派忍者偵察，不帶大名令
  if (S.R.fogOn && S.t >= 30 && S.t <= 180 && ok('scout')) {
    const total = S.units.filter(u => u.side === e && active(u) && !u.reinf).length;
    const scouts = S.ninjas.filter(n => n.side === s && n.alive && n.detUntil <= S.t).length;
    if (seen.length <= 2 && scouts >= 2 && !own.some(u => u.contacts.length))
      cands.push({ id: 'scout', text: `敵方佈陣還看不清（識別 ${seen.length}／${total} 隊）。先派忍者到敵線前偵察，看清楚再動。`, act: 'scout' });
  }
  const guarded = (E: Unit) => seen.some(X => X.type === 'spear' && !X.contacts.length && dist(X, E) < 60);
  // 1. 友軍動搖且有人能去幫
  const weak = weakestEngaged(S, s);
  if (weak && effM(S, weak) < 50 && own.some(u => u !== weak && !u.contacts.length && !u.retreating && (u.type === 'spear' || u.type === 'samurai' || u.type === 'cav')))
    push('relieve:' + weak.id, `${unitName(weak)}動搖了，派空手的部隊從側背打它的對手。`, 'relieve', weak.id);
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
  // 5. 我方軍勢不利：整頓（2026-10-22 回顧：全軍突擊、主將親征、半渡而擊三類建議量不出效果，連同兩道大名令一起拿掉）
  if (S.army[s] < 50 && S.army[e] > S.army[s] + 15 && own.filter(u => u.contacts.length).length >= 2) push('regroup', `我軍軍勢 ${Math.round(S.army[s])} 落後，先整頓戰線，別讓潰走連鎖。`, 'regroup');
  return cands[0] ?? null;
}
