// 決策卡引擎（大名模式主迴圈，2026-10-23 設計）：佈陣後部隊自走，遇到狀況由現場將領請示（事件卡）或軍師提案（方針卡），
// 戰場暫停等玩家選；選項 2～4 個、一個標「軍師建議」、依情報等級增減；執行交給部隊 AI，40 秒後以戰報回報結果。
// 放在模擬層讓 tools/daimyo.ts 能模擬「總是選建議／隨機選／不問」三種玩家。
import { TRAIT, type Side, type Trait } from './data.ts';
import { type State, type Unit, active, dist, effM, general, isRanged, archerRange, inWater, onField, mHit, streamYAt } from './sim.ts';
import { type CmdKind, type Doctrine, type Wing, issueCommand, doctrineOf, deployOf } from './ai.ts';
import { intelLvl, weakestEngaged, dispatchScouts, cmdBlocked, CMD_CD, unitName } from './advisor.ts';

export type DOption = { id: string; label: string; hint?: string; rec?: boolean };
export type Decision = { id: string; kind: 'doctrine' | 'event'; speaker: string; advisor: boolean; text: string; options: DOption[]; unit?: number; target?: number; cd: number; lead?: number }; // lead：「我親自帶隊」要切視角的部隊
type Pending = { at: number; text: string; unit?: number; men0?: number; mor0?: number };
export type DecState = { last: Record<string, number>; lastKind: Record<string, number>; nDoc: number; nEv: number; cmdCd: Partial<Record<CmdKind, number>>; pending: Pending[]; wingRestore: { at: number; w: 'L' | 'C' | 'R'; prev: Wing }[]; docRestore?: { at: number; attack: Doctrine['attack'] }; log: { t: number; id: string; opt: string; who: string; text: string; label: string }[] };
export function decState(S: State): DecState {
  let d = S.meta.dec as DecState | undefined;
  if (!d) { d = { last: {}, lastKind: {}, nDoc: 0, nEv: 0, cmdCd: {}, pending: [], wingRestore: [], log: [] }; S.meta.dec = d; }
  return d;
}
const GAP_KIND = { doctrine: 45, event: 20 }; // 同層卡片的最短間隔（秒）
// 將領口吻：事件卡文字結尾依性格加一句
const VOICE: Record<Trait, string[]> = { bold: ['請准我上！', '此時不衝更待何時。', '交給我，必取之。'], steady: ['請主公裁示。', '進退皆可，但要快。', '在下聽令。'], cautious: ['貿然行動恐有閃失。', '是否先觀望？', '請三思。'] };
const AGGRESSIVE = new Set(['charge', 'allin', 'raid', 'relieve', 'cross', 'cap', 'focus', 'commit', 'now', 'shift', 'cav', 'scout', 'stay']);
const DEFENSIVE = new Set(['hold', 'bank', 'retreat', 'back', 'ignore', 'regroup', 'ret45', 'keep', 'face', 'steady', 'pass', 'wait']);
export const traitOf = (name: string): Trait => TRAIT[name] ?? 'steady';
export const TRAIT_NAME: Record<Trait, string> = { bold: '猛', steady: '穩', cautious: '慎' };
// 「交給他判斷」：依性格從既有選項挑一個（猛→最積極、慎→最保守、穩→軍師建議）
export function delegatePick(d: Decision): DOption {
  const tr = traitOf(d.speaker); const real = d.options.filter(o => o.id !== 'delegate');
  if (tr === 'bold') return real.find(o => AGGRESSIVE.has(o.id)) ?? real[0];
  if (tr === 'cautious') return real.find(o => DEFENSIVE.has(o.id)) ?? real[real.length - 1];
  return real.find(o => o.rec) ?? real[0];
}
function withVoice(d: Decision, seed: number): Decision {
  if (d.advisor) return d;
  const tr = traitOf(d.speaker); const v = VOICE[tr][Math.abs(seed) % 3];
  return { ...d, text: `${d.text}${v}`, options: [...d.options, { id: 'delegate', label: `交給${d.speaker}判斷`, hint: `性格「${TRAIT_NAME[tr]}」：${tr === 'bold' ? '會選最積極的' : tr === 'cautious' ? '會選最保守的' : '會照軍師建議'}` }] };
}
const Yl = (side: Side, y: number) => side === 0 ? y : 700 - y;
const fwd = (side: Side) => side === 0 ? 1 : -1;
function wingOfUnit(S: State, s: Side, u: Unit): 'L' | 'C' | 'R' { const ax = (S.meta.ai as { ax: number }[])[s].ax; return u.x < ax - 40 ? 'L' : u.x > ax + 40 ? 'R' : 'C'; }

// 評估：回傳目前最該問的一張卡（沒有就 null）。只在玩家方、開戰 10 秒後。
export function evalDecision(S: State, s: Side): Decision | null {
  const D = decState(S), t = S.t, e = (1 - s) as Side, R = S.R;
  if (t < 10 || S.over) return null;
  const okId = (id: string, cd: number) => (D.last[id] ?? -1e9) + (id.startsWith('ev:') && cd < 1e8 ? cd * (R.decCdMul ?? 1) : cd) <= t; // 事件卡冷卻 × decCdMul
  const gap = { doctrine: R.decGapDoctrine ?? GAP_KIND.doctrine, event: R.decGapEvent ?? GAP_KIND.event };
  const okKind = (k: 'doctrine' | 'event') => (D.lastKind[k] ?? -1e9) + gap[k] <= t;
  const can = (k: CmdKind) => !cmdBlocked(S, s, k, D.cmdCd);
  const lvl = (E: Unit) => intelLvl(S, s, E);
  const own = S.units.filter(u => u.side === s && active(u));
  const seen = S.units.filter(u => u.side === e && active(u) && onField(u) && lvl(u) >= 2);
  const spotted = S.units.filter(u => u.side === e && active(u) && onField(u) && lvl(u) >= 1);
  const g = general(S, s), eg = general(S, e);
  const adv = g.advAlive ? (g.advisor ?? '軍師') : '';
  const guarded = (E: Unit) => seen.some(X => X.type === 'spear' && !X.contacts.length && dist(X, E) < 60);
  const cavFree = own.find(u => u.type === 'cav' && !u.contacts.length && !u.retreating);
  const rangedReady = own.some(u => isRanged(u) && u.ammo > 0);
  const doc = doctrineOf(S, s);
  const mk = (d: Omit<Decision, 'cd'> & { cd?: number }): Decision => withVoice({ cd: 90, ...d }, Math.floor(t));
  // 視角模式：只有主將旗本與騎兵將領能親自帶隊；視角中、或 30 秒內剛退出的部隊不給選項
  const lock = (S.meta.leadLock as Record<number, number> | undefined) ?? {};
  const canLead = (u: Unit | undefined | null) => !!u && ((S.meta.lead as number | undefined) ?? -1) < 0 && (u.type === 'cav' || u.type === 'general') && active(u) && !u.contacts.length && (lock[u.id] ?? -1) <= t;
  const LEAD_HINT = '切到該隊視角親自操作：士氣 +10、功績加倍；大將若討死軍勢再 −30';
  const leadOpt = (u: Unit, label: string): DOption[] => canLead(u) ? [{ id: 'lead', label, hint: LEAD_HINT }] : [];
  // ---- 方針卡（軍師提案，只在前提被推翻時）----
  if (okKind('doctrine') && adv) {
    // 敵主力位置偏向一翼
    if (okId('doc:main', 1e9)) {
      const line = seen.filter(E => !isRanged(E) && E.type !== 'cav' && E.type !== 'general');
      if (line.length >= 3) {
        const mx = line.reduce((a, u) => a + u.x, 0) / line.length, off = mx - 500;
        if (Math.abs(off) > 90) {
          const side = off > 0 ? '東' : '西';
          return mk({ id: 'doc:main', kind: 'doctrine', speaker: adv, advisor: true, cd: 1e9, text: `忍者回報：敵主力偏向${side}翼（識別 ${line.length} 隊）。我軍戰線要怎麼擺？`,
            options: [{ id: 'shift', label: `戰線壓向${side}翼`, hint: `${side}翼猛攻、另一翼固守`, rec: true }, { id: 'cav', label: `騎兵繞敵主力外側`, hint: '騎兵改到那一翼、接戰後繞後' }, { id: 'face', label: '維持正面', hint: '不改配置' }] });
        }
        D.last['doc:main'] = t; // 主力居中，不問
      }
    }
    // 敵大筒現身而我方還在等
    if (okId('doc:cannon', 1e9) && doc.attack !== 'now' && !own.some(u => u.contacts.length)) {
      const can_ = seen.find(E => E.type === 'cannon');
      if (can_) return mk({ id: 'doc:cannon', kind: 'doctrine', speaker: adv, advisor: true, cd: 1e9, target: can_.id, text: `敵大筒${unitName(can_)}現身，射程 260 m。守著等射完箭會先挨轟。`,
        lead: cavFree?.id, options: [...(cavFree && can('raid') ? [{ id: 'raid', label: '騎兵先打大筒', hint: '大筒 60 m 內打不到人', rec: true }] : []), ...(cavFree ? leadOpt(cavFree, `我親自帶${cavFree.cmd}隊去打大筒`) : []), { id: 'keep', label: '維持方針，照計畫推進', hint: '量測：倉促進攻反而吃虧', rec: !(cavFree && can('raid')) }] });
    }
    // 軍勢落後
    if (okId('doc:behind', 150) && t > 60 && S.army[s] + 15 <= S.army[e]) {
      const bad = S.army[s] < 45;
      return mk({ id: 'doc:behind', kind: 'doctrine', speaker: adv, advisor: true, cd: 150, text: `我軍軍勢 ${Math.round(S.army[s])}，落後敵軍 ${Math.round(S.army[e] - S.army[s])}。再拖下去會連鎖潰逃。`,
        options: [{ id: 'regroup', label: '整頓固守', hint: '戰線後退 60 m，動搖者脫離，守住再說', rec: true }, { id: 'ret45', label: '撤退線提高到 45', hint: '保存兵力，等敵軍露出破綻' }, { id: 'allin', label: '全軍壓上', hint: '賭一把；量測多半更糟' }] });
      void bad;
    }
    // 敵主將暴露
    if (okId('doc:gen', 120) && eg.cmdAlive && active(eg) && lvl(eg) >= 2 && !guarded(eg) && g.cmdAlive && active(g) && effM(S, g) >= 60 && dist(g, eg) < 220)
      return mk({ id: 'doc:gen', kind: 'doctrine', speaker: adv, advisor: true, cd: 120, target: eg.id, text: `敵主將${eg.cmd}身邊沒有長槍掩護，離我方本陣 ${Math.round(dist(g, eg))} m。`,
        lead: g.id, options: [...(can('commit') ? [{ id: 'commit', label: '主公親率旗本直取', hint: '旗本 30 秒內攻擊附近敵軍（AI 操作）', rec: true }] : []), ...leadOpt(g, '我親自帶旗本直取敵將'), ...(cavFree && can('raid') ? [{ id: 'raid', label: '騎兵繞後直取敵將', rec: !can('commit') }] : []), { id: 'ignore', label: '不理會' }] });
  }
  if (!okKind('event')) return null;
  // ---- 事件卡（現場將領請示）----
  // 敵軍半渡
  if (R.streams !== 'none' && okId('ev:water', 90) && can('charge')) {
    const wading = spotted.filter(E => inWater(S, E.x, E.y) === 1);
    const near = own.filter(u => u.role === 'line' && !u.contacts.length && wading.some(E => dist(u, E) < 140));
    if (wading.length >= 2 && near.length) { const u = near[0]; return mk({ id: 'ev:water', kind: 'event', speaker: u.cmd || unitName(u), advisor: false, unit: u.id, cd: 90, text: `敵軍 ${wading.length} 隊正在涉水！半渡而擊的機會。`,
      options: [{ id: 'charge', label: '半渡而擊，全軍壓上', rec: true }, { id: 'hold', label: '保持陣線，等它上岸' }] }); }
  }
  // 友軍動搖
  const weak = weakestEngaged(S, s);
  if (weak && effM(S, weak) < 50 && okId('ev:relieve:' + weak.id, 60)) {
    const foe = weak.primary >= 0 && weak.contacts.includes(weak.primary) ? S.units[weak.primary] : S.units[weak.contacts[0]];
    const opts: DOption[] = [];
    if (can('relieve') && own.some(u => u !== weak && !u.contacts.length && !u.retreating && (u.type === 'spear' || u.type === 'samurai' || u.type === 'cav'))) opts.push({ id: 'relieve', label: '派兩隊空手部隊側擊', hint: `打${unitName(foe)}的側背`, rec: true });
    if (can('focus') && rangedReady && own.some(u => isRanged(u) && dist(u, foe) <= archerRange(S, u, foe))) opts.push({ id: 'focus', label: '弓兵集火它的對手', rec: !opts.length });
    opts.push({ id: 'retreat', label: '先退到主將旁整頓', hint: '脫離接戰，不連累友軍', rec: !opts.length });
    if (g.cmdAlive && effM(S, g) >= 50 && dist(g, weak) < 200) opts.push(...leadOpt(g, '我親率旗本馳援'));
    if (opts.length >= 2) return mk({ id: 'ev:relieve:' + weak.id, kind: 'event', speaker: weak.cmd || unitName(weak), advisor: false, unit: weak.id, target: foe.id, cd: 60, lead: g.id, text: `${unitName(weak)}士氣只剩 ${Math.round(effM(S, weak))}，頂不住${unitName(foe)}了！`, options: opts });
  }
  // 敵隊動搖：集火／騎兵衝
  const wavE = seen.filter(E => E.state === 'waver' && E.contacts.length).sort((a, b) => effM(S, a) - effM(S, b))[0];
  if (wavE && okId('ev:focus:' + wavE.id, 60)) {
    const shooter = own.filter(u => isRanged(u) && u.ammo > 0 && dist(u, wavE) <= archerRange(S, u, wavE))[0];
    const opts: DOption[] = [];
    if (cavFree && can('raid')) opts.push({ id: 'raid', label: '騎兵繞到它背後衝鋒', hint: '動搖的部隊挨衝鋒多半直接潰走', rec: true });
    if (opts.length) { opts.push(...leadOpt(cavFree!, `我親自帶${cavFree!.cmd}隊衝`)); if (shooter && can('focus')) opts.push({ id: 'focus', label: '集中箭火', hint: '弓兵本來就會優先射動搖的敵軍，效果有限' }); opts.push({ id: 'ignore', label: '不理會' }); const sp = cavFree!; return mk({ id: 'ev:focus:' + wavE.id, kind: 'event', speaker: sp.cmd || unitName(sp), advisor: false, unit: sp.id, target: wavE.id, cd: 60, lead: sp.id, text: `敵${unitName(wavE)}已經動搖（士氣約 ${Math.round(effM(S, wavE))}）。`, options: opts }); }
  }
  // 敵遠程部隊沒有掩護
  if (cavFree && can('raid')) {
    const isolated = (E: Unit) => !seen.some(X => X !== E && !isRanged(X) && X.type !== 'cav' && dist(X, E) < 80);
    const ea = cavFree.men >= cavFree.men0 * 0.7 ? seen.filter(E => isRanged(E) && dist(cavFree, E) < 260 && !guarded(E) && isolated(E)).sort((a, b) => (a.type === 'cannon' ? -1 : 0) - (b.type === 'cannon' ? -1 : 0) || dist(a, cavFree) - dist(b, cavFree))[0] : undefined;
    if (ea && okId('ev:raid:' + ea.id, 150)) return mk({ id: 'ev:raid:' + ea.id, kind: 'event', speaker: cavFree.cmd || unitName(cavFree), advisor: false, unit: cavFree.id, target: ea.id, cd: 150,
      text: `敵${unitName(ea)}${ea.type === 'cannon' ? '的大筒' : ea.type === 'gun' ? '的鐵砲' : '的弓兵'}落單了，80 m 內沒有敵步兵，離我 ${Math.round(dist(cavFree, ea))} m。`,
      lead: cavFree.id, options: [{ id: 'raid', label: '繞到背後衝鋒', rec: true }, ...leadOpt(cavFree, '我親自帶隊繞後'), { id: 'ignore', label: '按兵不動' }] });
  }
  // 渡河：發起攻勢時戰線還在溪的己方側、對岸有識別的敵軍 → 問一次（渡河進攻／岸上等敵軍渡河）
  if (R.streams !== 'none' && okId('ev:ford', 1e9) && doc.attack !== 'hold') {
    const A = (S.meta.ai as { posture: string; ayl: number }[])[s];
    const lineU = own.filter(u => u.role === 'line' && !u.contacts.length);
    const ahead = (u: Unit) => { const ry = streamYAt(S, u.x); return ry !== null && Yl(s, ry) > Yl(s, u.y) + 10 && Yl(s, ry) < Yl(s, u.y) + 160; }; // 河在前方 10～160 m
    if (t <= 150 && A.posture === 'attack' && lineU.length >= 2 && lineU.every(ahead)) {
      const foe = seen.filter(E => !isRanged(E) && Yl(s, E.y) > Yl(s, lineU[0].y) + 40 && Yl(s, E.y) <= Yl(s, lineU[0].y) + 260).sort((a, b) => Yl(s, a.y) - Yl(s, b.y))[0];
      if (foe) { const u = lineU.sort((a, b) => dist(a, foe) - dist(b, foe))[0]; const foeNear = Yl(s, foe.y) < 360;
        return mk({ id: 'ev:ford', kind: 'event', speaker: u.cmd || unitName(u), advisor: false, unit: u.id, target: foe.id, cd: 1e9, text: `戰線已到溪邊，對岸 ${Math.round(Yl(s, foe.y) - Yl(s, u.y))} m 有敵${unitName(foe)}。先渡河的一方會挨半渡而擊。`,
          options: [{ id: 'cross', label: '渡河進攻', hint: '涉水中無法衝鋒、受箭 +30%，過了溪就能壓上', rec: !foeNear }, { id: 'bank', label: '在岸上列陣，等敵軍渡河', hint: '固守 90 秒，敵軍上岸時半渡而擊；若敵軍不來就白等', rec: foeNear }] }); }
    }
  }
  // 彈藥用盡
  for (const u of own) if (isRanged(u) && u.ammo <= 0 && !u.contacts.length && !u.retreating && okId('ev:ammo:' + u.id, 1e9))
    return mk({ id: 'ev:ammo:' + u.id, kind: 'event', speaker: u.cmd || unitName(u), advisor: false, unit: u.id, cd: 1e9, text: `${unitName(u)}${u.type === 'archer' ? '箭矢' : '彈藥'}已盡。`,
      options: [{ id: 'back', label: '退到主將旁', hint: '不再上前', rec: true }, { id: 'stay', label: '留在戰線', hint: '近戰很弱' }] });
  // 據點在前
  if (t > 30) for (const u of own) {
    if ((u.role !== 'line' && u.role !== 'reserve') || u.contacts.length || u.retreating) continue;
    const p = S.points.find(p => p.owner !== s && dist(u, p) < 90 && !spotted.some(E => dist(E, p) < 120) && okId('ev:point:' + p.id, 180));
    if (p) return mk({ id: 'ev:point:' + p.id, kind: 'event', speaker: u.cmd || unitName(u), advisor: false, unit: u.id, cd: 180, text: `前方 ${Math.round(dist(u, p))} m 是${p.id === 'village' ? '村落（援軍）' : p.id === 'temple' ? '寺廟（士氣 +10）' : '補給點（箭矢）'}，附近沒看到敵軍。`,
      options: [{ id: 'cap', label: '順路佔領', hint: '站進圓圈 20 秒', rec: true }, { id: 'pass', label: '不停留' }] });
  }
  // 情報不足
  if (R.fogOn && t >= 30 && t <= 120 && S.lastContactT <= 0 && okId('ev:scout', 1e9) && adv) {
    const scouts = S.ninjas.filter(n => n.side === s && n.alive && n.detUntil <= t).length;
    const total = S.units.filter(u => u.side === e && active(u) && !u.reinf).length;
    if (seen.length <= 2 && scouts >= 2 && !own.some(u => u.contacts.length))
      return mk({ id: 'ev:scout', kind: 'event', speaker: adv, advisor: true, cd: 1e9, text: `敵方佈陣還看不清（識別 ${seen.length}／${total} 隊）。`, options: [{ id: 'scout', label: '派忍者到敵線前偵察', hint: '45 秒後自動歸隊', rec: true }, { id: 'wait', label: '先不動' }] });
  }
  return null;
}

// 套用選項，回傳一行戰報。會把對應的大名令、方針或部隊狀態寫進模擬。
export function applyDecision(S: State, s: Side, d: Decision, optId: string): string {
  const D = decState(S), t = S.t;
  if (optId === 'delegate') { // 交給將領判斷：依性格挑一個既有選項，紀錄合併成一筆
    const o = delegatePick(d); const msg = applyDecision(S, s, d, o.id);
    const L = D.log[D.log.length - 1]; if (L) { L.opt = 'delegate:' + o.id; L.label = `交給${d.speaker}判斷 → ${o.label}`; }
    return `${d.speaker}自行判斷：${o.label}。${msg}`;
  }
  D.last[d.id] = t; D.lastKind[d.kind] = t; if (d.kind === 'doctrine') D.nDoc++; else D.nEv++;
  D.log.push({ t, id: d.id, opt: optId, who: d.speaker, text: d.text, label: d.options.find(o => o.id === optId)?.label ?? optId });
  const doc = (S.meta.doctrine as Doctrine[] | undefined)?.[s];
  const dep = deployOf(S, s);
  const U = d.unit !== undefined ? S.units[d.unit] : null, T = d.target !== undefined ? S.units[d.target] : null;
  const cmd = (k: CmdKind, target?: number) => { if (issueCommand(S, s, k, target)) { D.cmdCd[k] = t + CMD_CD[k]; return true; } return false; };
  const report = (text: string, u?: Unit | null) => { D.pending.push({ at: t + 40, text, unit: u?.id, men0: u?.men, mor0: u ? effM(S, u) : undefined }); };
  const who = d.speaker;
  if (optId === 'lead' && d.lead !== undefined) {
    const L = S.units[d.lead];
    S.meta.leadReq = { unit: d.lead, target: d.target }; // 遊戲層讀到後切視角
    mHit(S, L, S.R.leadMorale, 'lead');
    if (d.id.startsWith('ev:relieve') && U) cmd('relieve', U.id); // 旗本去馳援時，空手部隊也一起上
    report(`${unitName(L)}親自出擊`, L);
    return `主公親自帶${unitName(L)}出擊（士氣 +${S.R.leadMorale}、功績加倍）`;
  }
  switch (optId) {
    case 'shift': { const E = S.units.filter(u => u.side !== s && active(u) && intelLvl(S, s, u) >= 2 && !isRanged(u)); const mx = E.reduce((a, u) => a + u.x, 0) / Math.max(1, E.length); const w: 'L' | 'R' = mx > 500 ? 'R' : 'L'; if (dep) { dep.wings[w] = 'press'; dep.wings[w === 'L' ? 'R' : 'L'] = 'hold'; } return `依令：戰線壓向${w === 'R' ? '東' : '西'}翼`; }
    case 'cav': { const E = S.units.filter(u => u.side !== s && active(u) && intelLvl(S, s, u) >= 2 && !isRanged(u)); const mx = E.reduce((a, u) => a + u.x, 0) / Math.max(1, E.length); if (dep) dep.cavWing = mx > 500 ? 'E' : 'W'; if (doc) doc.cav = 'raid'; return `依令：騎兵改到${mx > 500 ? '東' : '西'}翼，接戰後繞後`; }
    case 'face': case 'keep': case 'ignore': case 'steady': case 'stay': case 'pass': case 'wait': return `${who}：遵命，維持現狀`;
    case 'now': if (doc) doc.attack = 'now'; return '依令：攻勢時機改為開戰即攻';
    case 'raid': if (T && cmd('raid', T.id)) { report(`騎兵繞後打${unitName(T)}`, T); return `依令：騎兵繞後突擊${unitName(T)}`; } return `${who}：騎兵現在動不了`;
    case 'commit': if (cmd('commit')) { report('主公親征', general(S, s)); return '依令：主公親率旗本出擊'; } return '主將現在動不了';
    case 'regroup': if (cmd('regroup')) { if (doc) doc.attack = 'hold'; return '依令：全軍整頓，固守待機'; } return '整頓令冷卻中';
    case 'allin': case 'charge': if (cmd('charge')) { if (doc) doc.attack = 'now'; report('全軍壓上'); return '依令：全軍壓上！'; } return '突擊令冷卻中';
    case 'ret45': if (doc) doc.retreatAt = 45; return '依令：撤退線提高到士氣 45';
    case 'hold': return `${who}：保持陣線`;
    case 'relieve': if (U && cmd('relieve', U.id)) { report(`馳援${unitName(U)}`, U); return `依令：兩隊空手部隊側擊${T ? unitName(T) : '敵軍'}`; } return '沒有空手的部隊可派';
    case 'focus': if (T && cmd('focus', T.id)) { report(`集火${unitName(T)}`, T); return `依令：弓兵集火${unitName(T)}`; } return '弓兵現在射不到';
    case 'retreat': case 'back': if (U) { U.retreating = true; U.hasDest = false; report(`${unitName(U)}退到主將旁`, U); } return `依令：${U ? unitName(U) : ''}退到主將旁整頓`;
    case 'cross': if (U) report(`${unitName(U)}渡河進攻`, U); return `${who}：渡河！`;
    case 'bank': if (doc) { D.docRestore = { at: t + 90, attack: doc.attack }; doc.attack = 'hold'; report('岸上列陣等敵軍渡河', U); return '依令：全線在岸上列陣固守 90 秒'; } return `${who}：列陣`;
    case 'cap': if (U) { const p = S.points.find(p => p.owner !== s && dist(U, p) < 90); if (p) { U.role = 'cap:' + p.id; return `依令：${unitName(U)}去佔領據點`; } } return '據點不在附近';
    case 'scout': { const n = dispatchScouts(S, s); return `依令：${n} 名忍者前往敵線前偵察`; }
  }
  return `${who}：遵命`;
}
// 每步呼叫：到期的翼方針還原、到期的戰報吐出（回傳要顯示的戰報）
export function tickDecisions(S: State, s: Side): string[] {
  const D = decState(S), t = S.t, out: string[] = [];
  const dep = deployOf(S, s);
  D.wingRestore = D.wingRestore.filter(r => { if (t >= r.at) { if (dep) dep.wings[r.w] = r.prev; return false; } return true; });
  if (D.docRestore && t >= D.docRestore.at) { const doc = (S.meta.doctrine as Doctrine[] | undefined)?.[s]; if (doc && doc.attack === 'hold') doc.attack = D.docRestore.attack; D.docRestore = undefined; out.push('戰報・岸上列陣期滿，恢復原方針'); }
  D.pending = D.pending.filter(p => {
    if (t < p.at) return true;
    const u = p.unit !== undefined ? S.units[p.unit] : null;
    if (u && p.men0 !== undefined && p.mor0 !== undefined) {
      const lost = p.men0 - (u.state === 'gone' ? 0 : u.men), st = u.state === 'rout' || u.state === 'shattered' ? '已潰走' : u.state === 'gone' ? '已離場' : `士氣 ${Math.round(effM(S, u))}`;
      out.push(`戰報・${p.text}：${u.side === s ? '' : '敵'}${unitName(u)}${lost > 0 ? `損 ${lost} 人` : '無損'}、${st}${u.merit > 0 && u.side === s ? `、功績 ${u.merit}` : ''}`);
    } else out.push(`戰報・${p.text}：我軍軍勢 ${Math.round(S.army[s])}、敵軍 ${Math.round(S.army[1 - s as Side])}`);
    return false;
  });
  return out;
}
