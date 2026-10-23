// 決策卡引擎（大名模式主迴圈，2026-10-23 設計）：佈陣後部隊自走，遇到狀況由現場將領請示（事件卡）或軍師提案（方針卡），
// 戰場暫停等玩家選；選項 2～4 個、一個標「軍師建議」、依情報等級增減；執行交給部隊 AI，40 秒後以戰報回報結果。
// 放在模擬層讓 tools/daimyo.ts 能模擬「總是選建議／隨機選／不問」三種玩家。
import type { Side } from './data.ts';
import { type State, type Unit, active, dist, effM, general, isRanged, archerRange, inWater, onField } from './sim.ts';
import { type CmdKind, type Doctrine, type Wing, issueCommand, doctrineOf, deployOf } from './ai.ts';
import { intelLvl, weakestEngaged, dispatchScouts, cmdBlocked, CMD_CD, unitName } from './advisor.ts';

export type DOption = { id: string; label: string; hint?: string; rec?: boolean };
export type Decision = { id: string; kind: 'doctrine' | 'event'; speaker: string; advisor: boolean; text: string; options: DOption[]; unit?: number; target?: number; cd: number };
type Pending = { at: number; text: string; unit?: number; men0?: number; mor0?: number };
export type DecState = { last: Record<string, number>; lastKind: Record<string, number>; nDoc: number; nEv: number; cmdCd: Partial<Record<CmdKind, number>>; pending: Pending[]; wingRestore: { at: number; w: 'L' | 'C' | 'R'; prev: Wing }[]; log: { t: number; id: string; opt: string }[] };
export function decState(S: State): DecState {
  let d = S.meta.dec as DecState | undefined;
  if (!d) { d = { last: {}, lastKind: {}, nDoc: 0, nEv: 0, cmdCd: {}, pending: [], wingRestore: [], log: [] }; S.meta.dec = d; }
  return d;
}
const GAP_KIND = { doctrine: 45, event: 20 }; // 同層卡片的最短間隔（秒）
const Yl = (side: Side, y: number) => side === 0 ? y : 700 - y;
const fwd = (side: Side) => side === 0 ? 1 : -1;
function wingOfUnit(S: State, s: Side, u: Unit): 'L' | 'C' | 'R' { const ax = (S.meta.ai as { ax: number }[])[s].ax; return u.x < ax - 40 ? 'L' : u.x > ax + 40 ? 'R' : 'C'; }

// 評估：回傳目前最該問的一張卡（沒有就 null）。只在玩家方、開戰 10 秒後。
export function evalDecision(S: State, s: Side): Decision | null {
  const D = decState(S), t = S.t, e = (1 - s) as Side, R = S.R;
  if (t < 10 || S.over) return null;
  const okId = (id: string, cd: number) => (D.last[id] ?? -1e9) + cd <= t;
  const okKind = (k: 'doctrine' | 'event') => (D.lastKind[k] ?? -1e9) + GAP_KIND[k] <= t;
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
  const mk = (d: Omit<Decision, 'cd'> & { cd?: number }): Decision => ({ cd: 90, ...d });
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
        options: [{ id: 'now', label: '立刻進攻', hint: '攻勢時機改為開戰即攻', rec: !cavFree }, ...(cavFree && can('raid') ? [{ id: 'raid', label: '騎兵先打大筒', hint: '大筒 60 m 內打不到人', rec: true }] : []), { id: 'keep', label: '維持方針' }] });
    }
    // 軍勢落後
    if (okId('doc:behind', 150) && t > 60 && S.army[s] + 15 <= S.army[e]) {
      const bad = S.army[s] < 45;
      return mk({ id: 'doc:behind', kind: 'doctrine', speaker: adv, advisor: true, cd: 150, text: `我軍軍勢 ${Math.round(S.army[s])}，落後敵軍 ${Math.round(S.army[e] - S.army[s])}。再拖下去會連鎖潰逃。`,
        options: [{ id: 'regroup', label: '整頓固守', hint: '戰線後退 60 m，動搖者脫離，守住再說', rec: bad }, { id: 'allin', label: '全軍壓上', hint: '趁還有力氣賭一把', rec: !bad }, { id: 'ret45', label: '撤退線提高到 45', hint: '保存兵力' }] });
    }
    // 敵主將暴露
    if (okId('doc:gen', 120) && eg.cmdAlive && active(eg) && lvl(eg) >= 2 && !guarded(eg) && g.cmdAlive && active(g) && effM(S, g) >= 60 && dist(g, eg) < 220)
      return mk({ id: 'doc:gen', kind: 'doctrine', speaker: adv, advisor: true, cd: 120, target: eg.id, text: `敵主將${eg.cmd}身邊沒有長槍掩護，離我方本陣 ${Math.round(dist(g, eg))} m。`,
        options: [...(cavFree && can('raid') ? [{ id: 'raid', label: '騎兵繞後直取敵將', rec: true }] : []), ...(can('commit') ? [{ id: 'commit', label: '主公親率旗本直取', hint: '旗本 30 秒內攻擊附近敵軍', rec: !cavFree }] : []), { id: 'ignore', label: '不理會' }] });
    // 敵軍動搖：全軍突擊
    const wav = seen.filter(E => E.state === 'waver').length, rt = seen.filter(E => E.state === 'rout').length;
    if (okId('doc:charge', 90) && t > 60 && wav + 2 * rt >= 2 && S.army[s] >= S.army[e] - 5 && can('charge'))
      return mk({ id: 'doc:charge', kind: 'doctrine', speaker: adv, advisor: true, cd: 90, text: `敵軍 ${wav} 隊動搖、${rt} 隊潰走。`,
        options: [{ id: 'charge', label: '全軍突擊', hint: '30 秒內全線跑步壓上、騎兵自由獵殺', rec: true }, { id: 'steady', label: '穩步推進', hint: '維持戰線' }] });
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
    if (opts.length >= 2) return mk({ id: 'ev:relieve:' + weak.id, kind: 'event', speaker: weak.cmd || unitName(weak), advisor: false, unit: weak.id, target: foe.id, cd: 60, text: `${unitName(weak)}士氣只剩 ${Math.round(effM(S, weak))}，頂不住${unitName(foe)}了！`, options: opts });
  }
  // 敵隊動搖：集火／騎兵衝
  const wavE = seen.filter(E => E.state === 'waver' && E.contacts.length).sort((a, b) => effM(S, a) - effM(S, b))[0];
  if (wavE && okId('ev:focus:' + wavE.id, 60)) {
    const shooter = own.filter(u => isRanged(u) && u.ammo > 0 && dist(u, wavE) <= archerRange(S, u, wavE))[0];
    const opts: DOption[] = [];
    if (shooter && can('focus')) opts.push({ id: 'focus', label: '集中箭火逼它潰走', rec: true });
    if (cavFree && can('raid')) opts.push({ id: 'raid', label: '騎兵繞到它背後衝鋒', rec: !shooter });
    if (opts.length) { opts.push({ id: 'ignore', label: '不理會' }); const sp = shooter ?? cavFree!; return mk({ id: 'ev:focus:' + wavE.id, kind: 'event', speaker: sp.cmd || unitName(sp), advisor: false, unit: sp.id, target: wavE.id, cd: 60, text: `敵${unitName(wavE)}已經動搖（士氣約 ${Math.round(effM(S, wavE))}）。`, options: opts }); }
  }
  // 敵遠程部隊沒有掩護
  if (cavFree && can('raid')) {
    const ea = seen.filter(E => isRanged(E) && dist(cavFree, E) < 260 && !guarded(E)).sort((a, b) => (a.type === 'cannon' ? -1 : 0) - (b.type === 'cannon' ? -1 : 0) || dist(a, cavFree) - dist(b, cavFree))[0];
    if (ea && okId('ev:raid:' + ea.id, 150)) return mk({ id: 'ev:raid:' + ea.id, kind: 'event', speaker: cavFree.cmd || unitName(cavFree), advisor: false, unit: cavFree.id, target: ea.id, cd: 150,
      text: `敵${unitName(ea)}${ea.type === 'cannon' ? '的大筒' : ea.type === 'gun' ? '的鐵砲' : '的弓兵'}沒有長槍掩護，離我 ${Math.round(dist(cavFree, ea))} m。`,
      options: [{ id: 'raid', label: '繞到背後衝鋒', rec: true }, { id: 'ignore', label: '按兵不動' }] });
  }
  // 渡口在前：戰線部隊快到溪邊，對岸有識別的敵軍
  if (R.streams !== 'none') for (const u of own) {
    if (u.role !== 'line' || u.contacts.length || u.retreating || !okId('ev:ford:' + u.id, 120)) continue;
    const ahead = inWater(S, u.x, u.y + fwd(s) * 25);
    if (!ahead) continue;
    const foe = seen.filter(E => !isRanged(E) && (E.y - u.y) * fwd(s) > 0 && dist(E, u) < 220).sort((a, b) => dist(a, u) - dist(b, u))[0];
    if (!foe) continue;
    const foeNearStream = inWater(S, foe.x, foe.y - fwd(s) * 25) !== 0 || dist(foe, u) < 90;
    return mk({ id: 'ev:ford:' + u.id, kind: 'event', speaker: u.cmd || unitName(u), advisor: false, unit: u.id, target: foe.id, cd: 120, text: `前方是溪流${ahead === 2 ? '（渡口）' : ''}，對岸有敵${unitName(foe)}，${Math.round(dist(foe, u))} m。要渡河嗎？`,
      options: [{ id: 'cross', label: '渡河進攻', hint: '涉水中無法衝鋒、受箭 +30%', rec: !foeNearStream }, { id: 'bank', label: '在岸上列陣，等敵軍渡河', hint: '這一翼固守 60 秒，敵軍上岸時半渡而擊', rec: foeNearStream }] });
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
  D.last[d.id] = t; D.lastKind[d.kind] = t; if (d.kind === 'doctrine') D.nDoc++; else D.nEv++;
  D.log.push({ t, id: d.id, opt: optId });
  const doc = (S.meta.doctrine as Doctrine[] | undefined)?.[s];
  const dep = deployOf(S, s);
  const U = d.unit !== undefined ? S.units[d.unit] : null, T = d.target !== undefined ? S.units[d.target] : null;
  const cmd = (k: CmdKind, target?: number) => { if (issueCommand(S, s, k, target)) { D.cmdCd[k] = t + CMD_CD[k]; return true; } return false; };
  const report = (text: string, u?: Unit | null) => { D.pending.push({ at: t + 40, text, unit: u?.id, men0: u?.men, mor0: u ? effM(S, u) : undefined }); };
  const who = d.speaker;
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
    case 'bank': if (U && dep) { const w = wingOfUnit(S, s, U); D.wingRestore.push({ at: t + 60, w, prev: dep.wings[w] }); dep.wings[w] = 'hold'; report(`${unitName(U)}在岸上列陣`, U); return `依令：${w === 'L' ? '左' : w === 'R' ? '右' : '中央'}翼在岸上固守 60 秒`; } return `${who}：列陣`;
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
