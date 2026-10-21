// 《決戰》M5：敵軍 AI、戰場迷霧、忍者情報與忍術、武將技／鬨聲／軍略。M4：士氣與軍勢可視化、連鎖潰逃、側背扇區、地形。M3：攻擊指令、近戰、射擊、衝鋒與傷亡畫面。戰鬥核心沿用士氣模擬器（src/sim）。
import * as THREE from 'three';
import { newState, step, effM, updDims, height, active, dist, cat, general, passiveOn, inForest, inPaddy, inMarsh, onTrail, mulberry32, useSkill, useStrategy, battleCry, useJutsu, skillBlocked, canSee, type Unit, type Formation, type Ninja } from '../sim/sim.ts';
import { MAP, UT } from '../sim/data.ts';
import { setup } from '../sim/ai.ts';
import { GAME_RULES, SIM_DT } from '../sim/game-rules.ts';
import { buildTerrain } from './terrain.ts';
import { UnitView, TYPE_NAME, KANJI, type CorpseSink } from './units.ts';
import { Corpses, Arrows, Dust, Pulses, FacingDisc } from './effects.ts';
import { playerOrders, attackRun, seenPos, retreatOrders } from './orders.ts';
import { NinjaView, AreaFx } from './ninja.ts';
import { SKILL, PASSIVE, STRATEGY, ADV_PASSIVE, JUTSU, CLAN_INFO } from './skills.ts';
import { CameraRig } from './camera.ts';
import { Hud } from './hud.ts';
import { portraitOf, ninjaPortrait, skillIcon, jutsuIcon, kamon, illus, img, kanBox } from './art.ts';
import { toWorld, toSim } from './coords.ts';

// ---------------- 場景 ----------------
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
const rig = new CameraRig(window.innerWidth / window.innerHeight);
const terrain = buildTerrain(scene);

// ---------------- 模擬 ----------------
// 網址 #clan=iga&foe=koga&seed=123 可指定忍者眾與亂數種子（出陣畫面選擇後會寫入網址並重新載入）
const params = new URLSearchParams(location.hash.slice(1));
const PLAYER_CLANS = ['mitsumono', 'iga', 'koga'], FOE_CLANS = ['nokizaru', 'iga', 'koga'];
const seed = Number(params.get('seed')) || ((Math.random() * 1e9) | 0);
const clan0 = PLAYER_CLANS.includes(params.get('clan') ?? '') ? params.get('clan')! : 'mitsumono';
const clan1 = FOE_CLANS.includes(params.get('foe') ?? '') ? params.get('foe')! : FOE_CLANS[Math.floor(mulberry32(seed ^ 0x5bd1)() * 3)];
// 測試用：網址 #ai=steady|line|crane 可切換 AI 變體（與 tools/pace.ts 的設定同名）
const AI_VARIANTS: Record<string, Partial<typeof GAME_RULES>> = {
  legacy: { aiSteady: false, aiLine: false }, steady: { aiSteady: true, aiLine: false }, line: { aiSteady: true, aiLine: true },
  crane: { aiSteady: true, aiLine: true, aiFormation: 'crane' }, craneT: { aiSteady: true, aiLine: true, aiFormation: 'craneT' },
};
const aiVar = params.get('ai');
const S = newState(aiVar && AI_VARIANTS[aiVar] ? { ...GAME_RULES, ...AI_VARIANTS[aiVar], name: `game+${aiVar}` } : GAME_RULES, seed, [clan0, clan1]);
S.dt = SIM_DT;
setup(S);          // 依設計文件佈陣：雙方各 8 隊、忍者
// 觀戰模式（#mode=watch）：雙方都由 AI 指揮
const WATCH = params.get('mode') === 'watch';
S.meta.aiSides = WATCH ? [0, 1] : [1];  // 指揮模式：AI 只指揮上杉軍；武田軍的「自動」忍者也由 AI 移動
const enemyAI = S.ai;
S.ai = WATCH ? enemyAI : (s: typeof S) => { playerOrders(s); enemyAI(s); };
S.fx = [];
if (!WATCH) for (const u of S.units) if (u.side === 0) { u.hasDest = false; u.role = ''; u.target = -1; }
const views = S.units.map(u => new UnitView(scene, u));
const ninViews = S.ninjas.map(n => new NinjaView(scene, n));
const areas = new AreaFx(scene), smoke = new Dust(scene, 600, '#d9dcd8', 2.2, 0.55), hoof = new Dust(scene, 500, '#b9a888', 0.8, 0.5), ash = new Dust(scene, 300, '#3b332c', 2.4, 0.6), ember = new Dust(scene, 200, '#e0703a', 0.4, 0.9);
let selNin = -1;                 // 選取的忍者
let jutsu: string | null = null; // 正在選目標的忍術
const myNinjas = () => S.ninjas.filter(n => n.side === 0 && n.alive);
// 情報等級：我軍 3；敵軍依戰場迷霧（與我軍接戰中至少為識別）
// 觀戰可切換：全知／武田視野／上杉視野
let visMode: 'all' | 0 | 1 = WATCH ? 'all' : 0;
const viewSide = () => (visMode === 'all' ? 0 : visMode) as 0 | 1;
const intelOf = (u: Unit) => {
  if (!S.R.fogOn || visMode === 'all' || u.side === visMode) return 3;
  return Math.max(S.vis[visMode][u.id], canSee(S, visMode, u) ? 2 : 0);
};
const viewOf = (id: number) => views[id];
const corpses = new Corpses(scene), arrows = new Arrows(scene), dust = new Dust(scene), pulses = new Pulses(scene);
const discTarget = new FacingDisc(scene), discInfo = new FacingDisc(scene);
let inspect = -1;   // 正在查看的敵軍
let infoClosed = -1; // 關掉資訊面板的部隊（重新選取時再打開）
let hoverEnemy = -1;
const sink: CorpseSink = (k, g, cav, x, y, hd, dir) => corpses.add(k, g, cav, x, y, hd, dir);
const isCavU = (u: Unit) => u.type === 'cav' || u.type === 'general';
const nameOf = (u: Unit) => `${u.cmd || '援軍'}隊`;
const mine = (u: Unit) => u.side === 0;
const selected = new Set<number>();
let paused = true, speed = 1, started = false;
const SPEEDS = WATCH ? [0.5, 1, 2, 3, 5] : [0.5, 1, 2, 3];

const setSel = (ids: number[], add: boolean) => {
  if (!add) selected.clear();
  if (ids.length) { inspect = -1; selNin = -1; }
  infoClosed = -1;
  for (const id of ids) { if (!mine(S.units[id]) || WATCH) continue; if (add && selected.has(id)) selected.delete(id); else selected.add(id); }
  views.forEach(v => (v.selected = selected.has(v.u.id)));
};
setSel([S.units.find(u => u.side === 0 && u.key === 'spear1')!.id], false);

const hud = new Hud(S.units.filter(mine), {
  onSelectCard: (id, add) => setSel([id], add),
  onFocusCard: id => { const u = S.units[id]; rig.tx = u.x; rig.ty = u.y - 20; setSel([id], false); },
  onPause: () => { paused = !paused; hud.toast(paused ? '已暫停，仍可下達指令' : '繼續'); },
  onSpeed: s => { speed = s; hud.toast(`速度 ${s}×`); },
  onFormation: () => cycleFormation(),
  onHalt: () => halt(),
  onBoxMode: () => { boxMode = !boxMode; hud.toast(boxMode ? '拖曳框選部隊' : '已取消框選'); },
  onSkill: () => skillSelected(),
  onRetreat: () => orderRetreat(),
});
hud.setArmyTicks(S.R.collapseAt, S.R.armyHighThresh);
let boxMode = false;
// 出陣畫面：模式與忍者眾（換了就寫入網址並重新載入，讓佈陣與情報從頭計算）
function reloadWith(over: Record<string, string | null>) {
  const p = new URLSearchParams(location.hash.slice(1));
  p.set('seed', String(seed)); p.set('clan', clan0); if (WATCH || params.has('foe')) p.set('foe', clan1); if (WATCH) p.set('mode', 'watch');
  for (const [k, v] of Object.entries(over)) { if (v === null) p.delete(k); else p.set(k, v); }
  location.hash = p.toString(); location.reload();
}
function begin() { started = true; paused = false; hud.toast(WATCH ? '開始觀戰' : '出陣！'); }
hud.speeds = SPEEDS;
hud.setWatch(WATCH, () => { camAuto = !camAuto; manualUntil = 0; hud.toast(camAuto ? '導播鏡頭' : '手動鏡頭'); },
  () => { visMode = visMode === 'all' ? 0 : visMode === 0 ? 1 : 'all'; hud.toast(visMode === 'all' ? '視野：全知' : `視野：${SIDE_NAME[visMode]}軍`); });
if (params.get('go') === '1') {
  params.delete('go'); history.replaceState(null, '', '#' + params.toString()); begin();
} else hud.showSetup2({
  mode: WATCH ? 'watch' : 'play', bg: illus('title'),
  clans0: PLAYER_CLANS.map(id => {
    const c = CLAN_INFO[id];
    return { id, short: `${img(ninjaPortrait(id), 'pp')}${c.name}<small>${c.jutsu.map(j => JUTSU[j].name).join('・')}</small>`,
      html: `<b>${img(ninjaPortrait(id), 'pp')}${c.name}</b><span class="m">${c.n} 人・情報${c.intel}・隱密${c.stealth}</span><span class="j">${c.jutsu.map(j => `<em>${JUTSU[j].name}</em>：${JUTSU[j].desc}`).join('<br>')}</span><span class="m">${c.note}</span>` };
  }), clan0,
  clans1: FOE_CLANS.map(id => ({ id, short: `${img(ninjaPortrait(id), 'pp')}${CLAN_INFO[id].name}<small>${(id === 'nokizaru' ? ['sennyu', 'sakuteki'] : CLAN_INFO[id].jutsu).map(j => JUTSU[j].name).join('・')}</small>` })), clan1,
  onMode: m => reloadWith({ mode: m === 'watch' ? 'watch' : null }),
  onPick0: id => { if (id !== clan0) reloadWith({ clan: id }); },
  onPick1: id => { if (id !== clan1) reloadWith({ foe: id }); },
  onGo: begin, onHelp: () => hud.showHelp(true),
  onNew: () => reloadWith({ seed: String((Math.random() * 1e9) | 0) }),
});

// ---------------- 拾取 ----------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function setRay(sx: number, sy: number) {
  ndc.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, rig.cam);
}
function groundAt(sx: number, sy: number): { x: number; y: number } | null {
  setRay(sx, sy);
  const hit = ray.intersectObject(terrain.ground, false)[0];
  return hit ? toSim(hit.point) : null;
}
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const tmp = new THREE.Vector3();
function planeAt(sx: number, sy: number): { x: number; y: number } | null {
  setRay(sx, sy);
  plane.constant = -height(rig.tx, rig.ty);
  return ray.ray.intersectPlane(plane, tmp) ? toSim(tmp) : null;
}
function screenOf(x: number, y: number, h: number) {
  const v = toWorld(x, y); v.y += h; v.project(rig.cam);
  return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight, ok: v.z < 1 };
}
function pickUnit(sx: number, sy: number, want: 'mine' | 'enemy' = 'mine'): Unit | null {
  const ok = (u: Unit) => (want === 'mine') === mine(u) && u.state !== 'gone' && intelOf(u) >= 1;
  let best: Unit | null = null, bd = 1e9;
  for (const v of views) {
    if (!ok(v.u)) continue;
    const gx = v.intel === 1 ? v.ghostX : v.u.x, gy = v.intel === 1 ? v.ghostY : v.u.y;
    const b = screenOf(gx, gy, v.banner.position.y - toWorld(gx, gy).y);
    const bh = v.banner.scale.y * window.innerHeight * 0.95, bw = bh * 0.72;
    if (b.ok && sx > b.x - bw / 2 - 6 && sx < b.x + bw / 2 + 6 && sy < b.y + 6 && sy > b.y - bh - 6) {
      const d = Math.abs(sx - b.x); if (d < bd) { bd = d; best = v.u; }
    }
  }
  if (best) return best;
  const g = groundAt(sx, sy); if (!g) return null;
  for (const v of views) {
    if (!ok(v.u) || intelOf(v.u) < 2) continue;
    const d = Math.hypot(g.x - v.u.x, g.y - v.u.y);
    if (d < Math.max(v.u.width, v.u.depth) / 2 + 4 && d < bd) { bd = d; best = v.u; }
  }
  return best;
}

// ---------------- 指令 ----------------
const marker = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#efe6d2', transparent: true, depthWrite: false }));
marker.renderOrder = 4; marker.visible = false; scene.add(marker);
let markerT = 0;
function flash(x: number, y: number, attack = false, r = 0) {
  marker.position.copy(toWorld(x, y)).add(new THREE.Vector3(0, 0.5, 0)); marker.visible = true; markerT = 0; markerR = r;
  (marker.material as THREE.MeshBasicMaterial).color.set(attack ? '#e0574a' : '#efe6d2');
}
let markerR = 0;
// 選取部隊的攻擊目標標示
const tgtRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#e0574a', transparent: true, opacity: 0.85, depthWrite: false }));
tgtRing.renderOrder = 3; tgtRing.visible = false; scene.add(tgtRing);

const selUnits = () => [...selected].map(id => S.units[id]).filter(u => u && u.state !== 'gone');
function orderMove(p: { x: number; y: number }, run: boolean) {
  if (WATCH) { hud.toast('觀戰模式：雙方都由 AI 指揮，無法下令；回出陣畫面選「親自指揮」'); return; }
  const all = selUnits(); if (!all.length) { hud.toast('先選取部隊（點部隊或左下旗牌）'); return; }
  // 接戰中的部隊被釘住，移動指令無效；要脫離要用撤退（T）
  const pinned = all.filter(u => u.contacts.length && !u.retreating && u.disUntil <= S.t);
  const us = all.filter(u => !pinned.includes(u));
  if (!us.length) { hud.toast(`${pinned.length > 1 ? '選取的部隊' : (pinned[0].cmd || '援軍') + '隊'}接戰中無法移動；要脫離請用撤退（右側「退」或 T）`); return; }
  const cx = us.reduce((a, u) => a + u.x, 0) / us.length, cy = us.reduce((a, u) => a + u.y, 0) / us.length;
  for (const u of us) {
    const ox = us.length > 1 ? u.x - cx : 0, oy = us.length > 1 ? u.y - cy : 0;
    u.destX = Math.max(5, Math.min(995, p.x + ox)); u.destY = Math.max(5, Math.min(695, p.y + oy));
    u.hasDest = true; u.run = run; u.finalF = NaN; u.target = -1; u.retreating = false; retreatOrders.delete(u.id);
  }
  flash(p.x, p.y);
  const tn = terrainShort(p.x, p.y, us.some(u => UT[u.type].cav));
  hud.toast((run ? '跑步前進' : '前進') + (tn ? `（${tn}）` : '') + (pinned.length ? `；${pinned.length} 隊接戰中留在原地` : ''));
}
function lineTargets(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  // 依部隊目前在陣線方向上的位置排序，避免互相穿越
  const us = selUnits().sort((p, q) => ((p.x - a.x) * dx + (p.y - a.y) * dy) - ((q.x - a.x) * dx + (q.y - a.y) * dy));
  const f = Math.atan2(dx, -dy); // 由左往右拉 → 面向前方
  const fx = Math.cos(f), fy = Math.sin(f);
  const total = us.reduce((s, u) => s + u.men, 0);
  let acc = 0;
  return us.map(u => {
    const seg = L * u.men / total;
    const mid = acc + seg / 2; acc += seg;
    const files = Math.max(UT_MIN(u), Math.min(u.men, Math.round(seg / u.sp) + 1));
    const ranks = Math.max(1, Math.ceil(u.men / files));
    const depth = ranks * u.sp;
    return { u, files, f, x: a.x + dx / L * mid - fx * depth / 2, y: a.y + dy / L * mid - fy * depth / 2, seg };
  });
}
const UT_MIN = (u: Unit) => (u.type === 'cav' || u.type === 'general' ? 3 : 5);
function orderLine(a: { x: number; y: number }, b: { x: number; y: number }, run: boolean) {
  if (WATCH) { hud.toast('觀戰模式：雙方都由 AI 指揮，無法下令；回出陣畫面選「親自指揮」'); return; }
  for (const t of lineTargets(a, b)) {
    const u = t.u;
    u.filesWanted = t.files; updDims(u);
    u.destX = t.x; u.destY = t.y; u.hasDest = true; u.run = run; u.finalF = t.f; u.target = -1; u.retreating = false; retreatOrders.delete(u.id);
  }
  hud.toast('變換陣線');
}
const FORMS: Formation[] = ['line', 'dense', 'loose'];
const FORM_NAME: Record<Formation, string> = { line: '橫陣', dense: '密集陣', loose: '散開' };
function cycleFormation() {
  const us = selUnits().filter(u => u.type !== 'cav' && u.type !== 'general'); if (!us.length) { hud.toast('騎兵沒有陣型可換'); return; }
  const next = FORMS[(FORMS.indexOf(us[0].form) + 1) % 3];
  for (const u of us) { u.form = next; updDims(u); }
  hud.toast(next === 'dense' && us.some(u => u.type === 'spear') ? '密集陣（長槍為槍衾）' : FORM_NAME[next]);
}
function halt() { for (const u of selUnits()) { u.hasDest = false; u.run = false; u.target = -1; if (retreatOrders.delete(u.id)) u.retreating = false; } hud.toast('停止'); }
// 有序撤退：脫離接戰、退到主將附近（或後方 80 m）。撤退中不還手，但不會連累友軍士氣、也不扣軍勢
function orderRetreat() {
  const us = selUnits().filter(u => active(u)); if (!us.length) return;
  const g = general(S, 0);
  for (const u of us) {
    u.retreating = true; u.target = -1; u.run = true; u.hasDest = true; u.finalF = Math.PI / 2; retreatOrders.add(u.id);
    if (g !== u && g.cmdAlive && active(g) && g.y < u.y - 20) { u.destX = g.x + (u.x - g.x) * 0.3; u.destY = g.y + 15; }
    else { u.destX = u.x; u.destY = Math.max(15, u.y - 80); }
  }
  hud.toast(us.some(u => u.contacts.length) ? '有序撤退：脫離接戰（撤退中不還手）' : '後撤');
}
function orderAttack(T: Unit, run: boolean) {
  const us = selUnits(); if (!us.length) return;
  for (const u of us) { u.target = T.id; u.retreating = false; retreatOrders.delete(u.id); attackRun.set(u.id, run); if (u.type === 'archer') u.fireTarget = T.id; }
  flash(T.x, T.y, true, Math.max(T.width, T.depth) / 2 + 4);
  const allArch = us.every(u => u.type === 'archer');
  hud.toast(allArch ? `射擊 ${nameOf(T)}` : run ? `全軍突擊 ${nameOf(T)}` : `攻擊 ${nameOf(T)}`);
}
function enemyInfo(T: Unit) { inspect = T.id; selNin = -1; }

// ---------------- 武將技、鬨聲、軍略 ----------------
function skillState(u: Unit): { ok: boolean; why: string; cd: number } {
  if (!u.skill) return { ok: false, why: '沒有武將技', cd: 0 };
  if (!u.cmdAlive) return { ok: false, why: '武將已討死', cd: 0 };
  if (!active(u)) return { ok: false, why: '部隊潰走中', cd: 0 };
  if (skillBlocked(S, 0)) return { ok: false, why: '被看破，暫時無法施放', cd: S.kanpaUntil[0] - S.t };
  if (u.skillCd > S.t) return { ok: false, why: '冷卻中', cd: u.skillCd - S.t };
  return { ok: true, why: '', cd: 0 };
}
function skillTarget(u: Unit): number {
  const sk = SKILL[u.skill!]; if (!sk?.target) return -1;
  let best = -1, bd = sk.target;
  for (const E of S.units) if (E.side === 1 && active(E) && intelOf(E) >= 2) { const d = dist(u, E); if (d <= bd) { bd = d; best = E.id; } }
  return best;
}
function trySkill(u: Unit, quiet = false): boolean {
  const st = skillState(u);
  if (!st.ok) { if (!quiet) hud.toast(`${SKILL[u.skill!]?.name ?? '武將技'}：${st.why}${st.cd > 0 ? `（${Math.ceil(st.cd)} 秒）` : ''}`); return false; }
  const tid = skillTarget(u);
  if (SKILL[u.skill!].target && tid < 0) { if (!quiet) hud.toast(`${SKILL[u.skill!].name}：${SKILL[u.skill!].target} m 內沒有看得到的敵軍`); return false; }
  const ok = useSkill(S, u, tid);
  if (!ok && !quiet) hud.toast(`${SKILL[u.skill!].name}：現在無法施放`);
  return ok;
}
function skillSelected() {
  const us = selUnits(); if (!us.length) return;
  const used = us.filter(u => trySkill(u, us.length > 1));
  if (us.length > 1) hud.toast(used.length ? `施放：${used.map(u => SKILL[u.skill!].name).join('、')}` : '選取的部隊都還不能施放武將技');
}
function cryState(u: Unit) { return !active(u) ? '部隊潰走中' : u.cryCd > S.t ? `冷卻中（${Math.ceil(u.cryCd - S.t)} 秒）` : ''; }
function tryCry(u: Unit) { const w = cryState(u); if (w) { hud.toast(`鬨聲：${w}`); return; } battleCry(S, u); }
function stratState(): string {
  const g = general(S, 0);
  if (!g.strategy) return '沒有軍略';
  if (!g.advAlive) return '軍師已討死';
  if (!active(g)) return '旗本潰走中';
  if (S.t < 60) return `開戰 60 秒後可用（${Math.ceil(60 - S.t)} 秒）`;
  if (skillBlocked(S, 0)) return `被看破（${Math.ceil(S.kanpaUntil[0] - S.t)} 秒）`;
  const cd = ((g as unknown as { stratCd?: number }).stratCd ?? 0) - S.t;
  return cd > 0 ? `冷卻中（${Math.ceil(cd)} 秒）` : '';
}
function tryStrat() { const w = stratState(); if (w) { hud.toast(`${STRATEGY[general(S, 0).strategy!].name}：${w}`); return; } useStrategy(S, 0); }

// ---------------- 忍者與忍術 ----------------
function selectNinja(id: number) { selNin = id; selected.clear(); views.forEach(v => (v.selected = false)); inspect = -1; }
function nextNinja(focus: boolean) {
  const ns = myNinjas(); if (!ns.length) return;
  const i = ns.findIndex(n => n.id === selNin);
  const n = focus && i >= 0 ? ns[i] : ns[(i + 1) % ns.length];
  selectNinja(n.id);
  if (focus) { rig.tx = n.x; rig.ty = n.y - 20; }
}
function pickNinja(sx: number, sy: number): Ninja | null {
  let best: Ninja | null = null, bd = 1e9;
  for (const v of ninViews) {
    if (v.n.side !== 0 || !v.n.alive) continue;
    const b = screenOf(v.n.x, v.n.y, 4.2);
    const r = v.banner.scale.y * window.innerHeight * 0.6 + 8;
    const cy = b.y - r * 0.8;
    const d = Math.hypot(sx - b.x, sy - cy);
    if (b.ok && d < r && d < bd) { bd = d; best = v.n; }
  }
  return best;
}
function moveNinja(p: { x: number; y: number }) {
  const n = S.ninjas[selNin]; if (!n || !n.alive) return;
  n.manual = true; n.tx = Math.max(3, Math.min(997, p.x)); n.ty = Math.max(3, Math.min(697, p.y));
  flash(p.x, p.y); hud.toast('忍者前往該處待命');
}
const JUTSU_PROMPT: Record<string, string> = { enemy: '點選目標敵軍', pos: '點選施放位置', point: '點選敵方據點', none: '' };
function startJutsu(j: string) {
  const w = jutsuState(); if (w) { hud.toast(`${JUTSU[j].name}：${w}`); return; }
  jutsu = j; hud.prompt(`${JUTSU[j].name}：${JUTSU_PROMPT[JUTSU[j].target]}（忍者 80 m 內）`);
}
function cancelJutsu() { jutsu = null; hud.prompt(null); }
hud.onCancelPrompt = cancelJutsu;
function jutsuState(): string {
  if (!myNinjas().length) return '忍者已全數陣亡';
  if (S.jutsuCd[0] > S.t) return `冷卻中（${Math.ceil(S.jutsuCd[0] - S.t)} 秒）`;
  return '';
}
function castAt(sx: number, sy: number) {
  const j = jutsu!; const J = JUTSU[j];
  const near = (x: number, y: number) => myNinjas().some(n => Math.hypot(n.x - x, n.y - y) <= 80);
  let a: { x: number; y: number; unit?: number; point?: number } | null = null;
  if (J.target === 'enemy') {
    const E = pickUnit(sx, sy, 'enemy'); if (!E) { hud.toast('請點選一隊敵軍'); return; }
    if (j === 'ansatsu' && (E.type === 'general' || !E.cmdAlive)) { hud.toast(E.type === 'general' ? '大將身邊戒備森嚴，無法暗殺' : '這隊的武將已經不在了'); return; }
    a = { x: E.x, y: E.y, unit: E.id };
  } else {
    const g = groundAt(sx, sy); if (!g) return;
    if (J.target === 'point') {
      const pi = S.points.findIndex(p => Math.hypot(p.x - g.x, p.y - g.y) <= MAP.pointR + 10);
      if (pi < 0 || S.points[pi].owner !== 1) { hud.toast('請點選上杉軍佔領中的據點'); return; }
      a = { x: S.points[pi].x, y: S.points[pi].y, point: pi };
    } else a = { x: g.x, y: g.y };
  }
  if (!near(a.x, a.y)) { hud.toast('目標不在任何忍者 80 m 內'); return; }
  if (!useJutsu(S, 0, j, a)) { hud.toast(`${J.name}：無法對這個目標施放`); return; }
  cancelJutsu();
}

// 陣線預覽
const prevMat = new THREE.LineBasicMaterial({ color: '#efe6d2', transparent: true, opacity: 0.9, depthTest: false });
const preview = new THREE.LineSegments(new THREE.BufferGeometry(), prevMat);
preview.renderOrder = 5; preview.visible = false; scene.add(preview);
function showPreview(a: { x: number; y: number } | null, b?: { x: number; y: number }) {
  if (!a || !b) { preview.visible = false; return; }
  const pts: THREE.Vector3[] = [];
  const lift = (x: number, y: number) => toWorld(x, y).add(new THREE.Vector3(0, 0.8, 0));
  for (const t of lineTargets(a, b)) {
    const fx = Math.cos(t.f), fy = Math.sin(t.f), rx = Math.sin(t.f), ry = -Math.cos(t.f);
    const w = (t.files - 1) * t.u.sp / 2 + 1, d = Math.ceil(t.u.men / t.files) * t.u.sp / 2 + 1;
    const c = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([l, k]) => lift(t.x + rx * l + fx * k, t.y + ry * l + fy * k));
    for (let i = 0; i < 4; i++) pts.push(c[i], c[(i + 1) % 4]);
    // 朝向箭頭
    const tip = lift(t.x + fx * (d + 8), t.y + fy * (d + 8));
    const base = lift(t.x + fx * (d + 2), t.y + fy * (d + 2));
    pts.push(lift(t.x + fx * d, t.y + fy * d), tip,
      tip, lift(t.x + fx * (d + 4) + rx * 3, t.y + fy * (d + 4) + ry * 3),
      tip, lift(t.x + fx * (d + 4) - rx * 3, t.y + fy * (d + 4) - ry * 3));
    void base;
  }
  preview.geometry.dispose();
  preview.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  preview.visible = true;
}

// ---------------- 輸入：滑鼠 ----------------
type P = { id: number; x: number; y: number; sx: number; sy: number; t: number; button: number; type: string };
const ptrs = new Map<number, P>();
let mode: 'none' | 'box' | 'line' | 'rotate' | 'pan' | 'pinch' | 'tapwait' = 'none';
let lineA: { x: number; y: number } | null = null, lineB: { x: number; y: number } | null = null;
let panAnchor: { x: number; y: number } | null = null;
let lastOrder = { t: 0, x: 0, y: 0 };
let longTimer = 0;
let mouse = { x: -1, y: -1, inside: false };
let pinch = { d: 0, a: 0, mx: 0, my: 0 };
let hoverT = 0;

const isDouble = (sx: number, sy: number) => performance.now() - lastOrder.t < 380 && Math.hypot(sx - lastOrder.x, sy - lastOrder.y) < 40;
function issueTap(sx: number, sy: number) {
  if (selNin >= 0) { const g = groundAt(sx, sy); if (g) moveNinja(g); return; }
  const run = isDouble(sx, sy);
  const E = pickUnit(sx, sy, 'enemy');
  if (E) { orderAttack(E, run); lastOrder = { t: performance.now(), x: sx, y: sy }; return; }
  const p = groundAt(sx, sy); if (!p) { if (selected.size) hud.toast('請點在戰場地面上'); return; }
  orderMove(p, run);
  lastOrder = { t: performance.now(), x: sx, y: sy };
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  try { canvas.setPointerCapture(e.pointerId); } catch { /* 合成事件或已釋放的指標 */ }
  const p: P = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), button: e.button, type: e.pointerType };
  ptrs.set(e.pointerId, p);
  if (e.pointerType === 'mouse') {
    if (mode === 'line') { showPreview(null); mode = 'none'; lineA = lineB = null; } // 上一次右鍵沒收到放開（macOS 右鍵選單會吃掉 pointerup）
    if (e.button === 1) mode = 'rotate';
    else if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
      // 右鍵（或 Mac 的 Ctrl＋點）：按下就下令，不等放開；之後有拖曳再改成拉陣線
      lineA = groundAt(e.clientX, e.clientY); mode = 'line'; p.button = 2;
      if (jutsu) cancelJutsu(); else issueTap(e.clientX, e.clientY);
    } else mode = 'tapwait';
    return;
  }
  // 觸控
  if (ptrs.size === 2) {
    clearTimeout(longTimer); showPreview(null);
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    panAnchor = planeAt(pinch.mx, pinch.my);
    mode = 'pinch'; return;
  }
  if (ptrs.size > 2) return;
  mode = 'tapwait';
  panAnchor = planeAt(e.clientX, e.clientY);
  clearTimeout(longTimer);
  longTimer = window.setTimeout(() => {
    if (mode === 'tapwait' && selected.size && !jutsu) {
      lineA = groundAt(p.sx, p.sy); lineB = lineA; mode = 'line';
      try { navigator.vibrate?.(12); } catch { /* 不支援時略過 */ }
      hud.toast('拖曳拉出陣線');
    }
  }, 420);
});

canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') {
    mouse = { x: e.clientX, y: e.clientY, inside: true };
    const now = performance.now();
    if (now - hoverT > 80) { hoverT = now; const E = pickUnit(e.clientX, e.clientY, 'enemy'); hoverEnemy = E ? E.id : -1; canvas.style.cursor = selected.size && E ? 'crosshair' : ''; }
  }
  const p = ptrs.get(e.pointerId); if (!p) return;
  if (p.type === 'mouse' && e.buttons === 0) { endPointer(e); return; } // 放開事件沒送到（右鍵選單、視窗切換）：補結束
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  const moved = Math.hypot(p.x - p.sx, p.y - p.sy);
  if (mode === 'rotate' || mode === 'pinch' || mode === 'pan') manualCam();
  if (mode === 'rotate') { rig.rotate(-dx * 0.006); rig.zoom(Math.exp(dy * 0.004)); return; }
  if (mode === 'line') {
    lineB = groundAt(p.x, p.y);
    if (lineA && lineB && Math.hypot(lineA.x - lineB.x, lineA.y - lineB.y) > 5) showPreview(lineA, lineB); else showPreview(null);
    return;
  }
  if (mode === 'pinch' && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (pinch.d > 0) rig.zoom(pinch.d / Math.max(10, d));
    let da = ang - pinch.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    rig.rotate(-da);
    pinch = { d, a: ang, mx, my };
    if (panAnchor) { rig.snap(); const now = planeAt(mx, my); if (now) { rig.tx += panAnchor.x - now.x; rig.ty += panAnchor.y - now.y; rig.clamp(); } }
    return;
  }
  if (mode === 'tapwait' && moved > 8) {
    clearTimeout(longTimer);
    if ((p.type === 'mouse' && !WATCH) || boxMode) { mode = 'box'; } else { mode = 'pan'; if (p.type === 'mouse') panAnchor = planeAt(p.sx, p.sy); }
  }
  if (mode === 'box') {
    const b = hud.box; b.style.display = 'block';
    b.style.left = `${Math.min(p.sx, p.x)}px`; b.style.top = `${Math.min(p.sy, p.y)}px`;
    b.style.width = `${Math.abs(p.x - p.sx)}px`; b.style.height = `${Math.abs(p.y - p.sy)}px`;
  } else if (mode === 'pan' && panAnchor) {
    rig.snap();
    const now = planeAt(p.x, p.y);
    if (now) { rig.tx += panAnchor.x - now.x; rig.ty += panAnchor.y - now.y; rig.clamp(); }
  }
});

function endPointer(e: PointerEvent) {
  const p = ptrs.get(e.pointerId); if (!p) return;
  ptrs.delete(e.pointerId);
  clearTimeout(longTimer);
  const quick = performance.now() - p.t < 450 && Math.hypot(p.x - p.sx, p.y - p.sy) < 9;
  if (p.type === 'mouse') {
    if (mode === 'line') {
      const b = groundAt(p.x, p.y);
      showPreview(null);
      if (lineA && b && Math.hypot(lineA.x - b.x, lineA.y - b.y) > 5 && selNin < 0 && !jutsu) orderLine(lineA, b, false);
      // 單點的指令已在按下時發出
    } else if (mode === 'box') {
      hud.box.style.display = 'none';
      const x0 = Math.min(p.sx, p.x), x1 = Math.max(p.sx, p.x), y0 = Math.min(p.sy, p.y), y1 = Math.max(p.sy, p.y);
      const ids = views.filter(v => { const s = screenOf(v.u.x, v.u.y, 2); return s.ok && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1; }).map(v => v.u.id);
      setSel(ids, e.shiftKey);
    } else if (mode === 'tapwait' && p.button === 0 && WATCH) {
      const u = pickUnit(p.x, p.y) ?? pickUnit(p.x, p.y, 'enemy'); inspect = u ? u.id : -1; infoT = 0;
    } else if (mode === 'tapwait' && p.button === 0 && jutsu) {
      castAt(p.x, p.y);
    } else if (mode === 'tapwait' && p.button === 0 && pickNinja(p.x, p.y)) {
      selectNinja(pickNinja(p.x, p.y)!.id);
    } else if (mode === 'tapwait' && p.button === 0) {
      const u = pickUnit(p.x, p.y);
      const E = u ? null : pickUnit(p.x, p.y, 'enemy');
      const pt = u || E ? -1 : pickPoint(p.x, p.y);
      if (u) setSel([u.id], e.shiftKey); else if (E) enemyInfo(E); else if (pt >= 0) { inspectPoint = pt; inspect = -1; infoT = 0; } else if (!e.shiftKey) setSel([], false);
    }
    mode = 'none'; lineA = null; return;
  }
  // 觸控
  if (mode === 'box') {
    hud.box.style.display = 'none';
    const x0 = Math.min(p.sx, p.x), x1 = Math.max(p.sx, p.x), y0 = Math.min(p.sy, p.y), y1 = Math.max(p.sy, p.y);
    setSel(views.filter(v => { const s = screenOf(v.u.x, v.u.y, 2); return s.ok && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1; }).map(v => v.u.id), false);
    boxMode = false; mode = 'none'; return;
  }
  if (mode === 'line') {
    showPreview(null);
    if (lineA && lineB && Math.hypot(lineA.x - lineB.x, lineA.y - lineB.y) > 5) orderLine(lineA, lineB, false);
    else if (lineA) orderMove(lineA, false);
    mode = 'none'; lineA = lineB = null; return;
  }
  if (mode === 'pinch') {
    if (ptrs.size === 1) { const [q] = [...ptrs.values()]; q.sx = q.x; q.sy = q.y; q.t = performance.now(); panAnchor = planeAt(q.x, q.y); mode = 'pan'; }
    else if (ptrs.size === 0) mode = 'none';
    return;
  }
  if (mode === 'tapwait' && quick && WATCH) {
    const u = pickUnit(p.x, p.y) ?? pickUnit(p.x, p.y, 'enemy'); inspect = u && u.id !== inspect ? u.id : -1; infoT = 0;
    if (ptrs.size === 0) mode = 'none'; return;
  }
  if (mode === 'tapwait' && quick && jutsu) { castAt(p.x, p.y); if (ptrs.size === 0) mode = 'none'; return; }
  if (mode === 'tapwait' && quick && pickNinja(p.x, p.y)) {
    const n = pickNinja(p.x, p.y)!; if (selNin === n.id) selNin = -1; else selectNinja(n.id);
    if (ptrs.size === 0) mode = 'none'; return;
  }
  if (mode === 'tapwait' && quick) {
    const u = pickUnit(p.x, p.y);
    if (u) setSel([u.id], selected.has(u.id)); // 點已選取的部隊＝取消；點其他部隊＝改選它
    else if (selNin >= 0) issueTap(p.x, p.y);
    else if (selected.size) issueTap(p.x, p.y);
    else { const E = pickUnit(p.x, p.y, 'enemy'); const pt = E ? -1 : pickPoint(p.x, p.y); if (E) enemyInfo(E); else if (pt >= 0) { inspectPoint = inspectPoint === pt ? -1 : pt; inspect = -1; infoT = 0; } }
  }
  if (ptrs.size === 0) mode = 'none';
}
canvas.addEventListener('pointerup', endPointer);
// macOS／Safari 的右鍵放開有時只到 window 不到 canvas：用 mouseup 補
window.addEventListener('mouseup', e => { for (const p of ptrs.values()) if (p.type === 'mouse') { p.x = e.clientX; p.y = e.clientY; endPointer({ pointerId: p.id, shiftKey: e.shiftKey } as PointerEvent); } });
window.addEventListener('contextmenu', e => { if ((e.target as HTMLElement | null)?.closest?.('#hud')) return; e.preventDefault(); }, true);
canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); clearTimeout(longTimer); showPreview(null); hud.box.style.display = 'none'; if (!ptrs.size) mode = 'none'; });
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') mouse.inside = false; });
canvas.addEventListener('wheel', e => { e.preventDefault(); manualCam(); rig.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });

// ---------------- 輸入：鍵盤 ----------------
const keys = new Set<string>();
const groups = new Map<string, number[]>();
let lastGroup = { k: '', t: 0 };
window.addEventListener('keydown', e => {
  if (hud.helpOpen()) { if (e.key === 'Escape' || e.key === 'Enter') hud.showHelp(false); return; }
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === ' ') { e.preventDefault(); paused = !paused; hud.toast(paused ? '已暫停，仍可下達指令' : '繼續'); }
  if (k === 'h') halt();
  if (k === 'f') cycleFormation();
  if (k === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setSel(S.units.filter(u => mine(u) && active(u)).map(u => u.id), false); }
  if (/^[1-9]$/.test(k)) {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); groups.set(k, [...selected]); hud.toast(`已設為第 ${k} 組`); }
    else if (groups.has(k)) {
      const ids = groups.get(k)!.filter(id => S.units[id].state !== 'gone');
      const now = performance.now();
      if (lastGroup.k === k && now - lastGroup.t < 350 && ids.length) { const u = S.units[ids[0]]; rig.tx = u.x; rig.ty = u.y - 20; }
      setSel(ids, false); lastGroup = { k, t: now };
    }
  }
  if (k === '-' || k === '_') { speed = SPEEDS[Math.max(0, SPEEDS.indexOf(speed) - 1)]; hud.toast(`速度 ${speed}×`); }
  if (k === '=' || k === '+') { speed = SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + 1)]; hud.toast(`速度 ${speed}×`); }
  if (k === 'escape') { if (jutsu) cancelJutsu(); else { setSel([], false); selNin = -1; } }
  if (k === 'r') skillSelected();
  if (k === 't') orderRetreat();
  if (k === 'c') for (const u of selUnits()) tryCry(u);
  if (k === 'v') tryStrat();
  if (k === 'n') nextNinja(false);
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); mouse.inside = false; });

function keyboardCamera(dt: number) {
  const v = rig.dist * 0.9 * dt;
  let r = 0, f = 0;
  if (keys.has('a') || keys.has('arrowleft')) r -= v;
  if (keys.has('d') || keys.has('arrowright')) r += v;
  if (keys.has('w') || keys.has('arrowup')) f += v;
  if (keys.has('s') || keys.has('arrowdown')) f -= v;
  if (mouse.inside && document.hasFocus() && mode === 'none' && !hud.helpOpen()) {
    const m = 14;
    if (mouse.x <= m) r -= v; else if (mouse.x >= window.innerWidth - m) r += v;
    if (mouse.y <= m) f += v; else if (mouse.y >= window.innerHeight - m) f -= v;
  }
  if (r || f || keys.has('q') || keys.has('e')) manualCam();
  if (r || f) rig.pan(r, f);
  if (keys.has('q')) rig.rotate(1.6 * dt);
  if (keys.has('e')) rig.rotate(-1.6 * dt);
}

// ---------------- 地形與士氣說明 ----------------
const known = (id: string) => S.known[0].has(id);
const knownMarsh = (x: number, y: number) => S.secrets.marsh.some((m, i) => known('m' + i) && Math.hypot(x - m.x, y - m.y) <= MAP.marshR);
function terrainShort(x: number, y: number, cav: boolean) {
  if (knownMarsh(x, y)) return '沼澤：移動 −60%、無法衝鋒';
  if (inPaddy(x, y)) return '稻田：移動 −30%、衝鋒減半';
  if (inForest(x, y)) return known('trail') && onTrail(S, x, y) ? '森林小徑：騎兵不減速' : cav ? '森林：騎兵移動 −40%' : '森林：受箭減半';
  return '';
}
function terrainNotes(u: Unit): string[] {
  const n: string[] = [];
  const t = terrainShort(u.x, u.y, UT[u.type].cav);
  if (t) n.push(t);
  else if (inMarsh(S, u.x, u.y)) n.push('陷入泥濘（移動 −60%）');
  if (inForest(u.x, u.y) && UT[u.type].cav && !t.startsWith('森林：受箭')) n.push('受箭減半');
  if (height(u.x, u.y) >= 8) n.push('小丘高處：視野 +50%' + (u.type === 'archer' ? '、射程 +20%' : ''));
  return n;
}
const MORALE_SRC: Record<string, string> = {
  losses: '傷亡', flank: '側擊', rear: '背襲', chargeHit: '騎兵衝鋒', volley: '箭雨', friendRout: '友軍潰走', cmdDeath: '武將討死',
  kuruma: '車懸', akazonae: '赤備', kesshiEnd: '決死結束', rumor: '流言', toseki: '投石', enemyCry: '敵方鬨聲', _drain: '持續消耗',
};
const ARMY_SRC: Record<string, string> = {
  unitRout: '部隊潰走', unitShatter: '部隊潰滅', bannerFall: '馬印倒下', enemyRout: '敵軍潰走', genDeath: '大將討死', viceDeath: '武將討死',
  advisorDeath: '軍師討死', pointGain: '奪取據點', pointLost: '失去據點', rally: '部隊重整', houka: '放火',
};
const SIDE_NAME = ['武田', '上杉'];
const pct = (v: number) => `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v))}`;
function auras(u: Unit): string[] {
  const R = S.R, a: string[] = [];
  const g = general(S, u.side);
  if (g.cmdAlive && active(g) && g !== u && dist(u, g) <= (passiveOn(g, 'bishamon') ? R.bishamonR : R.genAuraR)) a.push(`大將在側 +${R.genAura}`);
  if (g === u && g.cmdAlive && active(g)) a.push(`大將本陣 +${R.genAura}`);
  const tp = S.points[1];
  if (tp.owner === u.side && tp.burnedUntil <= S.t && dist(u, tp) <= R.templeR) a.push(`寺廟 +${R.templeAura}`);
  const s1 = S.meta.tenkyu as Unit | undefined;
  if (u.side === 0 && s1 && passiveOn(s1, 'tenkyu') && active(s1) && dist(u, s1) <= R.tenkyuR) a.push(`典廄 +${R.tenkyuAura}`);
  if (R.batteredFrac > 0 && u.men < R.batteredFrac * u.men0) return ['殘兵：加成失效'];
  return a;
}
function fogHtml(u: Unit): string {
  return `<div class="hd"><span class="k" style="background:#3b3a40">?</span>
    <div><div class="nm">敵影</div><div class="sub">察覺：只知道這附近有敵軍</div></div>
    <button class="x" type="button" aria-label="關閉">×</button></div>
    <div class="desc">讓部隊或忍者靠近（200 m 內可識別兵種與狀態），或使用忍術「物見」。</div>`;
}
function skillRows(u: Unit): string {
  const btn = (act: string, name: string, ok: boolean, sub: string, icon?: string) =>
    `<button type="button" class="act${ok ? ' ready' : ''}" data-act="${act}" ${ok ? '' : 'disabled'}>${img(icon, 'ic')}${name}${sub ? ` <small>${sub}</small>` : ''}</button>`;
  const out: string[] = [];
  const b: string[] = [];
  if (u.skill && SKILL[u.skill]) { const st = skillState(u); b.push(btn('skill', SKILL[u.skill].name, st.ok, st.ok ? 'R' : st.cd > 0 ? `${Math.ceil(st.cd)}s` : '', skillIcon(u.skill))); }
  const cw = cryState(u); b.push(btn('cry', '鬨聲', !cw, cw ? (u.cryCd > S.t ? `${Math.ceil(u.cryCd - S.t)}s` : '') : 'C', skillIcon('cry')));
  const g = general(S, 0);
  if (u === g && g.strategy) { const w = stratState(); b.push(btn('strat', STRATEGY[g.strategy].name, !w, w ? (w.match(/（(\d+) 秒）/)?.[1] ?? '') + (w.includes('秒') ? 's' : '') : 'V', skillIcon(g.strategy))); }
  out.push(`<div class="acts">${b.join('')}</div>`);
  const d: string[] = [];
  if (u.skill && SKILL[u.skill]) d.push(`<b>${SKILL[u.skill].name}</b>：${SKILL[u.skill].desc}${u.cmdAlive ? '' : '（武將已討死）'}`);
  d.push(`<b>鬨聲</b>：本隊士氣 +${S.R.cryOwn}、${S.R.cryR} m 內敵軍 ${S.R.cryEnemy}，冷卻 ${S.R.cryCd} 秒`);
  if (u === g && g.strategy) d.push(`<b>${STRATEGY[g.strategy].name}</b>（軍略）：${STRATEGY[g.strategy].desc}`);
  if (u.passive && PASSIVE[u.passive]) d.push(`被動・${PASSIVE[u.passive]}`);
  if (u === g && g.advPassive && ADV_PASSIVE[g.advPassive]) d.push(`軍師被動・${ADV_PASSIVE[g.advPassive]}`);
  out.push(`<div class="desc">${d.map((x, i) => `<div class="dl${i === 0 ? ' key' : ''}">${x}</div>`).join('')}</div>`);
  return out.join('');
}
function ninjaHtml(n: Ninja): string {
  const c = CLAN_INFO[S.clan[0]], alive = myNinjas().length, w = jutsuState();
  const det = n.detUntil > S.t;
  const st = !n.alive ? '<span class="neg">陣亡</span>' : det ? '<span class="neg">被發現！撤退中</span>' : n.manual ? '待命（點地面移動）' : '自動偵察中';
  const btns = c.jutsu.map(j => `<button type="button" class="act${!w ? ' ready' : ''}${jutsu === j ? ' on' : ''}" data-act="j:${j}" ${w ? 'disabled' : ''}>${img(jutsuIcon(j), 'ic')}${JUTSU[j].name}</button>`).join('');
  return `<div class="hd">${kanBox('k', '忍', '#2a262e', ninjaPortrait(S.clan[0]))}
    <div><div class="nm">${c.name}・忍者 ${n.id + 1 - S.ninjas.findIndex(x => x.side === 0)}</div><div class="sub">存活 ${alive}／${c.n} 人</div></div>
    <button class="x" type="button" aria-label="關閉">×</button></div>
    <div class="row"><span>狀態</span><span>${st}</span></div>
    <div class="acts">${btns}${n.manual ? '<button type="button" class="act" data-act="auto">改回自動</button>' : ''}</div>
    <div class="desc"><div class="dl key">${w ? `忍術${w}。` : ''}共用冷卻 90 秒；目標須在任一忍者 80 m 內。</div>${c.jutsu.map(j => `<div class="dl key"><b>${JUTSU[j].name}</b>：${JUTSU[j].desc}</div>`).join('')}<div class="dl">忍者靠近敵軍 ${S.R.insightR} m 內可洞悉其士氣；被發現後遭敵軍貼近 3 秒會陣亡。</div></div>`;
}
hud.onInfoAct = act => {
  if (act.startsWith('j:')) { const j = act.slice(2); if (jutsu === j) cancelJutsu(); else startJutsu(j); return; }
  if (act === 'auto') { const n = S.ninjas[selNin]; if (n) { n.manual = false; hud.toast('忍者恢復自動偵察'); } return; }
  const u = infoUnit(); if (!u || u.side !== 0) return;
  if (act === 'skill') trySkill(u);
  else if (act === 'cry') tryCry(u);
  else if (act === 'strat') tryStrat();
  infoT = 0;
};
function infoUnit(): Unit | null {
  if (inspect >= 0) return S.units[inspect];
  return selected.size === 1 ? S.units[[...selected][0]] : null;
}
function infoHtml(u: Unit): string {
  const lvl = intelOf(u);
  if (lvl <= 1) return fogHtml(u);
  const R = S.R, m = effM(S, u), side = u.side;
  const routing = u.state === 'rout' || u.state === 'shattered';
  const stName = u.state === 'shattered' ? '潰滅' : u.state === 'rout' ? '潰走中' : retreatOrders.has(u.id) ? '撤退中' : u.retreating ? '整頓中' : u.state === 'high' ? '士氣高昂' : u.state === 'waver' ? '動搖' : '穩定';
  const stCls = routing ? 'neg' : u.state === 'waver' ? 'warn' : u.state === 'high' ? 'pos' : '';
  const color = m >= 80 ? '#7fb36a' : m >= 50 ? '#c9b458' : m >= 25 ? '#d0803c' : '#c0392b';
  const form = UT[u.type].cav ? '' : `・${FORM_NAME[u.form]}`;
  const rows: string[] = [];
  const au = auras(u); rows.push(`<div class="row"><span>加成</span><span class="${au.length ? 'pos' : ''}">${au.join('・') || '無'}</span></div>`);
  const tn = terrainNotes(u); if (tn.length) rows.push(`<div class="row"><span>地形</span><span>${tn.join('・')}</span></div>`);
  if (u.contacts.length) {
    const parts = u.contacts.map(id => {
      const E = S.units[id], c = cat(E, u);
      const lab = c === 0 ? '正面' : c === 1 ? '<b class="warn">側面</b>' : '<b class="neg">背面</b>';
      let hi = '';
      const dh = height(u.x, u.y) - height(E.x, E.y);
      if (dh >= 5) hi = '・<span class="pos">居高 +15%</span>'; else if (dh <= -5) hi = '・<span class="neg">仰攻</span>';
      return `${lab} ${E.cmd || '援軍'}隊${hi}`;
    });
    rows.push(`<div class="row"><span>接戰</span><span>${parts.join('<br>')}</span></div>`);
  }
  // 10 秒內的士氣打擊
  const agg: Record<string, number> = {};
  for (const e of u.recent) if (S.t - e.t <= 10) agg[e.src] = (agg[e.src] || 0) + e.d;
  const ev = Object.entries(agg).filter(([, d]) => d <= -0.5).sort((a, b) => a[1] - b[1]).slice(0, 4);
  if (ev.length) rows.push(`<div class="row"><span>近況</span><span class="neg">${ev.map(([k, d]) => `${MORALE_SRC[k] || k} ${pct(d)}`).join('・')}</span></div>`);
  if (u.state === 'rout') {
    let wait = passiveOn(u, 'nigedanjo') ? R.rallyWaitNige : R.rallyWait;
    const g = general(S, side); if (g.cmdAlive && active(g) && dist(u, g) <= R.genAuraR) wait /= 2;
    const left = Math.max(0, wait - (S.t - u.lastDmgT));
    rows.push(`<div class="row"><span>重整</span><span>${left > 0 ? `脫離戰鬥 ${Math.ceil(left)} 秒後，` : ''}士氣回到 ${R.rallyAt} 即可重整${R.rallyCap > 0 ? `（重整後士氣上限 ${R.rallyCap}，再潰走即潰滅）` : ''}${g.cmdAlive && active(g) && dist(u, g) <= R.genAuraR ? '（大將在側，等待減半）' : ''}</span></div>`);
  } else if (u.state === 'shattered') rows.push(`<div class="row"><span>　</span><span class="neg">已第 ${u.routCount} 次潰逃，無法再重整</span></div>`);
  else if (u.retreating) rows.push(`<div class="row"><span>　</span><span>重整後不會主動出擊；下達指令或士氣回到 50 即恢復</span></div>`);
  if (u.type === 'archer') rows.push(`<div class="row"><span>箭矢</span><span class="${u.ammo <= 3 ? 'warn' : ''}">${u.ammo}／${u.ammoMax} 輪</span></div>`);
  if (u.cmd) rows.push(`<div class="row"><span>武將</span><span>${u.cmd}${u.cmdAlive ? '' : '（討死）'}${u.advisor ? `・軍師 ${u.advisor}${u.advAlive ? '' : '（討死）'}` : ''}</span></div>`);
  return `<div class="hd">${kanBox('k', KANJI[u.type], side === 0 ? 'var(--takeda)' : 'var(--uesugi)', portraitOf(u.cmd))}
    <div><div class="nm">${WATCH ? `${SIDE_NAME[side]}・` : side === 1 ? '敵・' : ''}${u.cmd || '援軍'}隊</div><div class="sub">${TYPE_NAME[u.type]}${form}・${lvl >= 3 ? `${u.men}／${u.men0} 人` : `約 ${Math.max(5, Math.round(u.men / 5) * 5)} 人`}${side !== viewSide() && !(WATCH && visMode === 'all') ? (lvl >= 3 ? '・<span class="pos">洞悉</span>' : '・識別') : ''}</div></div>
    <button class="x" type="button" aria-label="關閉">×</button></div>
    <div class="mb"><span class="${stCls}">${stName}</span>${lvl >= 3 ? `<span class="bar"><i style="width:${m}%;background:${color}"></i><b style="left:${R.routAt}%"></b><b style="left:${R.waverAt}%"></b><b style="left:${R.highAt}%"></b></span><span class="v">${Math.round(m)}</span>` : '<span class="desc" style="margin:0">確切士氣需洞悉（忍者靠近或物見）</span>'}</div>
    ${(lvl >= 3 ? rows : rows.filter(r => !r.includes('近況') && !r.includes('加成') && !r.includes('箭矢') && !r.includes('重整'))).join('')}
    ${side === 0 && !WATCH ? skillRows(u) : lvl >= 3 && u.skill && SKILL[u.skill] ? `<div class="desc"><b>${SKILL[u.skill].name}</b>：${SKILL[u.skill].desc}${u.skillCd > S.t ? `（冷卻 ${Math.ceil(u.skillCd - S.t)} 秒）` : '（可施放）'}</div>` : ''}`;
}

hud.onInfoClose = () => { if (inspectPoint >= 0 && !selected.size && inspect < 0 && selNin < 0) inspectPoint = -1; else if (selNin >= 0) { selNin = -1; cancelJutsu(); } else if (inspect >= 0) inspect = -1; else if (selected.size === 1) { infoClosed = [...selected][0]; hud.setInfo(null); } };

// ---------------- 戰鬥事件 ----------------
const menBefore: number[] = [];
const surroundT = new Map<number, number>();
const SECRET_NAME: Record<string, string> = { m: '沼澤（移動 −60%、無法衝鋒）', a: '伏兵地（森林中可藏兵）', t: '森林小徑（騎兵可通行不減速）' };
function revealSecret(id: string, announce: boolean) {
  if (id === 'trail') terrain.reveal('trail', S.secrets.trailX, 350);
  else { const p = id[0] === 'm' ? S.secrets.marsh[+id[1]] : S.secrets.ambush[+id[1]]; terrain.reveal(id[0] === 'm' ? 'marsh' : 'ambush', p.x, p.y); }
  if (announce) hud.toast(`探明地形：${SECRET_NAME[id[0]]}`);
}
for (const id of WATCH ? ['m0', 'm1', 'trail', 'a0', 'a1'] : [...S.known[0]]) revealSecret(id, false);
const armyFlag = [{ low: false, col: false }, { low: false, col: false }];
function armyAlerts() {
  for (const s of [0, 1] as const) {
    const v = S.army[s], f = armyFlag[s];
    if (S.R.armyLowPer10s < 0 && v < S.R.armyLowThresh && !f.low) { f.low = true; say(`${SIDE_NAME[s]}軍軍心動搖：全軍士氣每 10 秒 ${S.R.armyLowPer10s}`); }
    if (v >= S.R.armyLowThresh + 5) f.low = false;
    if (v < S.R.collapseAt && !f.col && (s === 0 || hud.armyExact[1])) { f.col = true; say(`${SIDE_NAME[s]}軍總崩潰！`); }
  }
}
const arrowLand = new Map<number, number>(); // 本步被射擊的部隊 → 箭矢落地的模擬時間
type Float = { el: HTMLElement; x: number; y: number; h: number; t: number };
const floats: Float[] = [];
const floatLayer = document.createElement('div'); floatLayer.className = 'floats'; document.getElementById('hud')!.prepend(floatLayer);
function floatText(u: Unit, text: string, cls: string) {
  if (floats.length > 24 || intelOf(u) < 2) return;
  const el = document.createElement('div'); el.className = `ft ${cls}`; el.textContent = text; floatLayer.appendChild(el);
  floats.push({ el, x: u.x, y: u.y, h: 12, t: 0 });
}
function updateFloats(dt: number) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt;
    if (f.t > 1.8) { f.el.remove(); floats.splice(i, 1); continue; }
    const s = screenOf(f.x, f.y, f.h);
    f.el.style.display = s.ok ? '' : 'none';
    f.el.style.transform = `translate(${s.x}px, ${s.y - f.t * 22}px) translate(-50%, -100%)`;
    f.el.style.opacity = String(f.t < 1.2 ? 1 : 1 - (f.t - 1.2) / 0.6);
  }
}
function volleyFx(A: Unit, T: Unit) {
  const va = viewOf(A.id), vt = viewOf(T.id);
  const shots = Math.min(28, Math.ceil(va.alive * 0.6));
  let land = 0;
  for (let i = 0; i < shots; i++) {
    const a = Math.floor(Math.random() * Math.max(1, va.alive)), b = Math.floor(Math.random() * Math.max(1, vt.alive));
    const x0 = va.alive ? va.px[a] : A.x, y0 = va.alive ? va.py[a] : A.y;
    const x1 = (vt.alive ? vt.px[b] : T.x) + (Math.random() - 0.5) * 6, y1 = (vt.alive ? vt.py[b] : T.y) + (Math.random() - 0.5) * 6;
    land = Math.max(land, arrows.fire(x0, y0, x1, y1, Math.random() * 0.35));
  }
  arrowLand.set(T.id, S.t + land * 0.8);
}
function jutsuFx(side: 0 | 1, j: string, unit?: number, point?: number) {
  const [name, res] = j.split(':'); const J = JUTSU[name];
  const U = unit !== undefined ? S.units[unit] : null;
  if (side === 0) {
    if (name === 'ansatsu' && U) say(res === 'ok' ? `暗殺成功：${U.cmd} 討死！` : `暗殺 ${U.cmd} 失敗`);
    else if (name === 'houka' && point !== undefined) say(`放火：${['村落', '寺廟', '補給點'][point]} 60 秒內失效`);
    else say(`忍術「${J.name}」`);
    if (U && name === 'rumor') floatText(U, `流言 ${S.R.rumor}`, 'hit');
    return;
  }
  // 敵方忍術：只告訴玩家看得出來的部分
  if (name === 'rumor' && U) { say(`敵忍散布流言：${nameOf(U)}士氣 ${S.R.rumor}，30 秒不回復`); floatText(U, `流言 ${S.R.rumor}`, 'bad'); }
  else if (name === 'ansatsu' && U) say(res === 'ok' ? `${U.cmd} 遭敵忍暗殺！` : `擊退刺殺 ${U.cmd} 的敵忍`);
  else if (name === 'houka' && point !== undefined) say(`敵忍放火：我方${['村落', '寺廟', '補給點'][point]} 60 秒內失效`);
  else if (name === 'sakuteki') say('敵軍「搜敵」：附近的我方忍者暴露了');
  else if (name === 'kirigakure') say('敵軍陣中升起煙霧（霧隱）');
}
const ninDet = new Map<number, boolean>();
// 指揮模式的提示；觀戰時改用左上角戰報
function say(text: string) { if (!WATCH) hud.toast(text); }
const clock = () => `${Math.floor(S.t / 60)}:${String(Math.floor(S.t % 60)).padStart(2, '0')}`;
const POINT_NAME = ['村落', '寺廟', '補給點'];
const POINT_EFFECT = ['佔領 90 秒後起每 90 秒來一批援軍（長槍 60 人，最多 2 批）', `${S.R.templeR} m 內友軍士氣 +${S.R.templeAura}`, '60 m 內的弓兵每 20 秒回補 1 輪箭矢'];
let inspectPoint = -1;
function pickPoint(sx: number, sy: number): number {
  const g = groundAt(sx, sy); if (!g) return -1;
  return S.points.findIndex(p => Math.hypot(p.x - g.x, p.y - g.y) <= MAP.pointR);
}
function pointHtml(i: number): string {
  const p = S.points[i];
  const own = p.owner < 0 ? '無人佔領' : `${SIDE_NAME[p.owner]}軍佔領`;
  const rows: string[] = [];
  rows.push(`<div class="row"><span>效果</span><span>${POINT_EFFECT[i]}</span></div>`);
  if (p.progSide >= 0 && p.prog > 0) {
    const need = S.units.some(u => u.side === p.progSide && active(u) && passiveOn(u, 'cap12') && dist(u, p) <= MAP.pointR) ? 12 : 20;
    rows.push(`<div class="row"><span>佔領</span><span class="${p.progSide === 0 ? 'pos' : 'neg'}">${SIDE_NAME[p.progSide]}軍佔領中 ${Math.min(99, Math.round(p.prog / need * 100))}%</span></div>`);
  }
  if (p.burnedUntil > S.t) rows.push(`<div class="row"><span>放火</span><span class="neg">效果失效，${Math.ceil(p.burnedUntil - S.t)} 秒後恢復</span></div>`);
  if (i === 0 && p.owner >= 0) {
    const s = p.owner as 0 | 1, used = S.reinfUsed[s];
    rows.push(`<div class="row"><span>援軍</span><span>${used >= 2 ? '援軍已全數派出' : `第 ${used + 1} 批約 ${Math.max(0, Math.ceil(90 - (S.t - S.reinfT[s])))} 秒後抵達`}（${used}／2）</span></div>`);
  }
  return `<div class="hd"><span class="k" style="background:${p.owner === 0 ? 'var(--takeda)' : p.owner === 1 ? 'var(--uesugi)' : '#6b645a'}">${POINT_NAME[i][0]}</span>
    <div><div class="nm">${POINT_NAME[i]}</div><div class="sub">${own}</div></div>
    <button class="x" type="button" aria-label="關閉">×</button></div>${rows.join('')}
    <div class="desc">部隊站進圓圈內 20 秒即可佔領（雙方都在圈內時暫停）。一方控制全部三個據點 60 秒即獲勝。</div>`;
}
const pointOwner = S.points.map(p => p.owner);
function watchFeed(e: { k: string; a: number; b?: number; n?: number; s?: string }) {
  const A = e.k === 'jutsu' || e.k === 'army' ? null : e.k === 'ninjaDead' ? null : S.units[e.a];
  const T = e.b !== undefined && e.k !== 'jutsu' ? S.units[e.b] : null;
  const F = (side: number, text: string, big = false) => hud.feed(clock(), text, side, big);
  switch (e.k) {
    case 'rout': case 'shatter': F(A!.side, `${nameOf(A!)}${e.k === 'shatter' ? '潰滅' : '潰走'}`, true); hot.push({ x: A!.x, y: A!.y, t: S.t, w: 60 }); break;
    case 'rally': F(A!.side, `${nameOf(A!)}重整`); break;
    case 'cmd': F(A!.side, `${A!.cmd} 討死`, true); hot.push({ x: A!.x, y: A!.y, t: S.t, w: 80 }); break;
    case 'adv': F(A!.side, `軍師 ${A!.advisor} 討死`, true); break;
    case 'skill': if (SKILL[e.s!]) F(A!.side, `${A!.cmd}「${SKILL[e.s!].name}」`); hot.push({ x: A!.x, y: A!.y, t: S.t, w: 25 }); break;
    case 'strat': if (STRATEGY[e.s!]) F(A!.side, `${A!.advisor}獻策「${STRATEGY[e.s!].name}」`, true); break;
    case 'charge': if (e.n && T) { F(A!.side, `${nameOf(A!)}衝入 ${nameOf(T)}`); hot.push({ x: T.x, y: T.y, t: S.t, w: 50 }); } break;
    case 'rear': if (T) { F(A!.side, `${nameOf(A!)}背襲 ${nameOf(T)}`); hot.push({ x: T.x, y: T.y, t: S.t, w: 40 }); } break;
    case 'jutsu': {
      const [name, res] = e.s!.split(':'); const U = e.b !== undefined ? S.units[e.b] : null;
      const J = JUTSU[name]; if (!J) break;
      F(e.a, `忍術「${J.name}」${U ? `→ ${nameOf(U)}` : e.n !== undefined ? `→ ${POINT_NAME[e.n]}` : ''}${name === 'ansatsu' ? (res === 'ok' ? '，成功！' : '，失敗') : ''}`, name === 'ansatsu' && res === 'ok');
    } break;
    case 'ninjaDead': F(S.ninjas[e.a].side, '一名忍者陣亡'); break;
  }
}
// ---------------- 觀戰：導播鏡頭 ----------------
let ended = false;
let camAuto = true, manualUntil = 0, dirT = 0, focusSince = -99;
const focus = { x: 500, y: 330, d: 430 };
const hot: { x: number; y: number; t: number; w: number }[] = [];
function manualCam() { if (WATCH) manualUntil = performance.now() + 10000; }
function director(dt: number) {
  if (!WATCH || !started || !camAuto || performance.now() < manualUntil) return;
  dirT -= dt;
  if (dirT <= 0) {
    dirT = 1;
    while (hot.length && S.t - hot[0].t > 10) hot.shift();
    const iu = inspect >= 0 ? S.units[inspect] : null;
    if (iu && iu.state !== 'gone') { focus.x = iu.x; focus.y = iu.y - 15; focus.d = 140; }
    else {
      const eng = S.units.filter(u => u.state !== 'gone' && u.contacts.length);
      const scoreAt = (x: number, y: number) => {
        let sc = 0;
        for (const v of eng) if (Math.hypot(v.x - x, v.y - y) < 100) sc += v.men;
        for (const h of hot) if (Math.hypot(h.x - x, h.y - y) < 100) sc += h.w * (1 - (S.t - h.t) / 10);
        return sc;
      };
      let bx = 0, by = 0, bs = 0;
      for (const c of [...eng, ...hot]) { const sc = scoreAt(c.x, c.y); if (sc > bs) { bs = sc; bx = c.x; by = c.y; } }
      const cur = scoreAt(focus.x, focus.y + 15);
      let cx: number, cy: number;
      if (bs > 0 && (cur < bs * 0.6 || S.t - focusSince > 12)) { cx = bx; cy = by; if (Math.hypot(bx - focus.x, by - focus.y) > 60) focusSince = S.t; }
      else if (bs > 0) { cx = focus.x; cy = focus.y + 15; }
      else cx = cy = NaN;
      if (!isNaN(cx)) {
        // 以交戰群的重心與範圍決定鏡頭
        const g = eng.filter(v => Math.hypot(v.x - cx, v.y - cy) < 110);
        if (g.length) { cx = g.reduce((a, v) => a + v.x, 0) / g.length; cy = g.reduce((a, v) => a + v.y, 0) / g.length; }
        const spread = g.reduce((m, v) => Math.max(m, Math.hypot(v.x - cx, v.y - cy)), 0);
        focus.x = cx; focus.y = cy - 15; focus.d = Math.max(120, Math.min(270, spread * 2.4 + 100));
      } else {
        const all = S.units.filter(u => u.state !== 'gone' && u.state !== 'rout' && u.state !== 'shattered');
        const mx = all.reduce((a, v) => a + v.x, 0) / all.length, my = all.reduce((a, v) => a + v.y, 0) / all.length;
        const spread = all.reduce((m, v) => Math.max(m, Math.hypot(v.x - mx, v.y - my)), 0);
        focus.x = mx; focus.y = my - 30; focus.d = Math.max(240, Math.min(560, spread * 1.5 + 120));
      }
    }
  }
  const k = 1 - Math.exp(-dt * 1.4);
  rig.tx += (focus.x - rig.tx) * k; rig.ty += (focus.y - rig.ty) * k; rig.dist += (focus.d - rig.dist) * k * 0.6;
  rig.clamp();
}
// ---------------- 觀戰：結算 ----------------
const OVER_TYPE: Record<string, string> = { collapse: '總崩潰', wipe: '全軍覆沒', points: '控制全部據點 60 秒', time: '時間到，軍勢較高者勝' };
function showEnd() {
  const o = S.over!; const R = S.rec;
  const w = o.winner;
  const title = WATCH ? (w === -1 ? '平手' : `${SIDE_NAME[w]}軍勝`) : w === -1 ? '平手' : w === 0 ? '勝利' : '敗北';
  const loser = w === -1 ? null : (1 - w) as 0 | 1;
  const why = o.type === 'collapse' && loser !== null ? `${SIDE_NAME[loser]}軍總崩潰` : OVER_TYPE[o.type] ?? o.type;
  const row = (label: string, f: (s: 0 | 1) => string | number) => `<tr><th>${label}</th><td>${f(0)}</td><td>${f(1)}</td></tr>`;
  const men = (s: 0 | 1) => { const us = S.units.filter(u => u.side === s); return `${us.reduce((a, u) => a + (u.state === 'gone' ? 0 : u.men), 0)}／${us.reduce((a, u) => a + u.men0, 0)}`; };
  const wp = w >= 0 ? img(portraitOf(w === 0 ? '武田信玄' : '上杉謙信'), 'pp') : '';
  const html = `<h2${!WATCH && w === 0 ? ' style="color:#e3c26b"' : !WATCH && w === 1 ? ' style="color:#a9bde0"' : ''}>${wp}${title}</h2><p class="why">${!WATCH && w >= 0 ? `${SIDE_NAME[w]}軍勝・` : ''}${why}・${Math.floor(o.t / 60)} 分 ${Math.round(o.t % 60)} 秒・${CLAN_INFO[S.clan[0]].name} 對 ${CLAN_INFO[S.clan[1]].name}</p>
    <table><tr><th></th><th style="color:#e3a39c">${img(kamon(0), 'km')}武田</th><th style="color:#a9bde0">${img(kamon(1), 'km')}上杉</th></tr>
    ${row('軍勢', s => Math.round(S.army[s]))}
    ${row('在場兵力', men)}
    ${row('潰走（次）', s => R.routs.filter(r => r.side === s).length)}
    ${row('全滅（隊）', s => R.wipes.filter(r => r.side === s).length)}
    ${row('武將討死', s => R.cmdDeaths.filter(r => r.side === s && r.who !== 'advisor').length)}
    ${row('據點', s => S.points.filter(p => p.owner === s).length)}
    ${row('忍者存活', s => `${S.ninjas.filter(n => n.side === s && n.alive).length}／${S.ninjas.filter(n => n.side === s).length}`)}
    ${row('暗殺成功', s => `${R.nin[s].assKill}／${R.nin[s].assTry}`)}
    </table>`;
  hud.showEnd(html, [
    { label: WATCH ? '再看一場' : '再戰一場', fn: () => reloadWith({ seed: String((Math.random() * 1e9) | 0), go: '1' }) },
    { label: WATCH ? '重播這一場' : '重新挑戰這一場', fn: () => reloadWith({ go: '1' }) },
    { label: '回出陣畫面', fn: () => reloadWith({}) },
    { label: '檢視戰場', fn: () => hud.hideEnd() },
  ], illus('loading'));
}
function afterStep() {
  for (const n of S.ninjas) {
    if (n.side !== 0 || !n.alive) continue;
    const det = n.detUntil > S.t;
    if (det && !ninDet.get(n.id)) { say('忍者被發現！撤退中'); n.manual = false; }
    ninDet.set(n.id, det);
  }
  if (views.length < S.units.length) {
    for (let i = views.length; i < S.units.length; i++) {
      const u = S.units[i];
      const v = new UnitView(scene, u); v.setBannerScale(bannerH); views.push(v);
      if (u.side === 0 && !WATCH) { hud.addCard(u); hud.toast(`村落援軍抵達：${TYPE_NAME[u.type]} ${u.men} 人（第 ${S.reinfUsed[0]}／2 批）`); }
      if (WATCH) hud.feed(clock(), `村落援軍抵達（第 ${S.reinfUsed[u.side]}／2 批）`, u.side);
    }
  }
  arrowLand.clear();
  if (WATCH) {
    for (const e of S.fx!) watchFeed(e);
    S.points.forEach((p, i) => { if (p.owner !== pointOwner[i]) { pointOwner[i] = p.owner; if (p.owner >= 0) hud.feed(clock(), `奪取${POINT_NAME[i]}`, p.owner, true); } });
  } else S.points.forEach((p, i) => {
    if (p.owner === pointOwner[i]) return;
    const prev = pointOwner[i]; pointOwner[i] = p.owner;
    if (p.owner === 0) hud.toast(`奪取${POINT_NAME[i]}：${POINT_EFFECT[i]}`);
    else if (prev === 0) hud.toast(`失去${POINT_NAME[i]}！`);
    else if (p.owner === 1) hud.toast(`上杉軍佔領${POINT_NAME[i]}`);
  });
  for (const e of S.fx!) {
    const A = S.units[e.a], T = e.b !== undefined ? S.units[e.b] : null;
    switch (e.k) {
      case 'volley': if (T) volleyFx(A, T); break;
      case 'charge': if (T) {
        const d = dist(A, T) || 1, dx = (T.x - A.x) / d, dy = (T.y - A.y) / d;
        const ix = T.x - dx * Math.min(d * 0.5, T.depth / 2 + 2), iy = T.y - dy * Math.min(d * 0.5, T.depth / 2 + 2);
        dust.burst(ix, iy, e.n ? 26 : 12, e.n ? 10 : 6, dx, dy);
        if (e.n) viewOf(T.id).push(ix, iy, dx, dy, 12);
        floatText(T, e.n ? '衝鋒' : '突擊', 'hit');
      } break;
      case 'blocked': if (T) floatText(A, isCavU(A) && T.type === 'spear' ? '槍衾受阻' : '衝鋒受阻', 'bad'); break;
      case 'flank': if (T) floatText(T, `側擊 ${pct(e.n ?? 0)}`, 'hit'); break;
      case 'rear': if (T) floatText(T, `背襲 ${pct(e.n ?? 0)}`, 'hit'); break;
      case 'chain': if ((e.n ?? 0) <= -0.5) floatText(A, `友軍潰走 ${pct(e.n!)}`, 'bad'); break;
      case 'cheer': floatText(A, `敵潰 ${pct(e.n ?? 0)}`, 'good'); break;
      case 'surround': if ((surroundT.get(A.id) ?? -99) < S.t - 6) { surroundT.set(A.id, S.t); floatText(A, '被包圍', 'bad'); } break;
      case 'army': if (Math.abs(e.n ?? 0) >= 0.5) hud.armyEvent(e.a as 0 | 1, e.n!, ARMY_SRC[e.s!] || '軍勢'); break;
      case 'found': if (e.a === 0) revealSecret(e.s!, true); break;
      case 'skill': {
        const sk = SKILL[e.s!]; if (!sk) break;
        floatText(A, sk.name, mine(A) ? 'good' : 'hit');
        if (mine(A)) say(`${A.cmd}「${sk.name}」`);
        else if (intelOf(A) >= 2) say(`敵將 ${A.cmd}「${sk.name}」：${sk.desc}`);
        if (T && e.s === 'toseki') floatText(T, '投石', 'hit');
        if (e.s === 'kuruma' || e.s === 'furin') pulses.add(A.x, A.y, 100, mine(A) ? '#c9a227' : '#7fa3e0', 1.6);
      } break;
      case 'strat': {
        const st = STRATEGY[e.s!]; if (!st) break;
        say(mine(A) ? `${A.advisor}獻策「${st.name}」：${st.desc}` : `上杉軍師 ${A.advisor}「${st.name}」：${e.s === 'kanpa' ? '我軍 20 秒內無法施放武將技與軍略' : st.desc}`);
      } break;
      case 'cry': floatText(A, '鬨聲', mine(A) ? 'good' : 'hit'); if (intelOf(A) >= 2) pulses.add(A.x, A.y, S.R.cryR, mine(A) ? '#efe6d2' : '#7fa3e0', 0.9); break;
      case 'jutsu': jutsuFx(e.a as 0 | 1, e.s!, e.b, e.n); break;
      case 'ninjaDead': {
        const n = S.ninjas[e.a];
        if (n.side === 0) { say(e.s === 'ansatsu' ? '暗殺失敗，忍者陣亡' : '忍者遭敵軍捕殺'); if (selNin === n.id) selNin = -1; }
        else say('討取一名敵方忍者');
      } break;
      case 'rout': case 'shatter':
        floatText(A, e.k === 'shatter' ? '潰滅' : '潰走', 'bad');
        if (intelOf(A) >= 2) pulses.add(A.x, A.y, S.R.friendlyRoutR, '#e0574a');
        if (mine(A) || intelOf(A) >= 2) say(mine(A) ? `${nameOf(A)}${e.k === 'shatter' ? '潰滅' : '潰走'}！` : `敵軍 ${nameOf(A)}${e.k === 'shatter' ? '潰滅' : '潰走'}`);
        break;
      case 'rally': floatText(A, '重整', 'good'); if (mine(A)) say(`${nameOf(A)}重整完畢，等候命令`); break;
      case 'cmd': say(`${mine(A) ? '' : '敵將 '}${A.cmd} 討死！`); floatText(A, '討死', 'bad'); break;
      case 'adv': say(`${mine(A) ? '' : '敵軍師 '}${A.advisor} 討死！`); break;
    }
  }
  S.fx!.length = 0;
  armyAlerts();
  // 傷亡：箭矢等落地才倒下；近戰的倒在敵方那一側
  for (const u of S.units) {
    const lost = (menBefore[u.id] ?? u.men) - u.men;
    if (lost <= 0 || (u.state === 'gone' && u.hp > 0)) continue;
    const v = viewOf(u.id);
    const land = arrowLand.get(u.id);
    if (land !== undefined) { v.kill(lost, land, u.x, u.y, true); continue; }
    const E = u.contacts.length ? S.units[u.contacts.includes(u.primary) ? u.primary : u.contacts[0]] : u;
    v.kill(lost, S.t + Math.random() * 0.3, E.x, E.y, false);
  }
}

// ---------------- 主迴圈 ----------------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  rig.cam.aspect = w / h; rig.cam.updateProjectionMatrix();
  views.forEach(v => v.setBannerScale(h));
  ninViews.forEach(v => v.setBannerScale(h));
  bannerH = h;
}
let bannerH = window.innerHeight;
window.addEventListener('resize', resize);
resize();
rig.tx = 500; rig.ty = 150; rig.dist = 280; rig.snap();

let infoT = 0, smokeAcc = 0, hoofAcc = 0;
hud.addNinjaCard(dbl => nextNinja(dbl), S.clan[0]);
let last = performance.now(), acc = 0, fpsN = 0, fpsT = 0, cpu = 0;
// 自動畫質：連續 3 秒低於 30 fps 就降低解析度
let lowFor = 0;
const PR_STEPS = [Math.min(window.devicePixelRatio, 2), 1.5, 1, 0.75].filter((v, i, a) => i === 0 || v < a[0]);
let prIdx = 0;
function autoQuality(fps: number) {
  if (document.hidden || paused) return;
  lowFor = fps < 30 ? lowFor + 0.5 : 0;
  if (lowFor >= 3 && prIdx < PR_STEPS.length - 1) {
    prIdx++; renderer.setPixelRatio(PR_STEPS[prIdx]); resize(); lowFor = 0;
    hud.toast(`畫質自動降低（解析度 ${PR_STEPS[prIdx]}×）`);
  }
}
function frame(now: number) {
  const t0 = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!paused) {
    acc += dt * speed;
    let n = 0;
    while (acc >= SIM_DT && n < 12) {
      for (const v of views) { v.prevX = v.u.x; v.prevY = v.u.y; }
      for (const v of ninViews) { v.prevX = v.n.x; v.prevY = v.n.y; }
      for (const u of S.units) menBefore[u.id] = u.men;
      step(S); acc -= SIM_DT; n++;
      afterStep();
      if (S.over && !ended) { ended = true; paused = true; showEnd(); break; }
    }
  }
  const alpha = paused ? 1 : Math.min(1, acc / SIM_DT);
  keyboardCamera(dt);
  rig.apply(dt);
  const gdt = paused ? 0 : dt * speed;
  for (const v of views) {
    const lvl = intelOf(v.u);
    v.update(gdt, alpha, effM(S, v.u), S.t, S.units, sink, lvl, lvl === 1 ? seenPos(S, viewSide(), v.u) ?? undefined : undefined);
  }
  for (const v of ninViews) {
    v.selected = v.n.id === selNin; v.showRange = jutsu !== null && v.n.side === 0;
    v.update(gdt, alpha, visMode === 'all' || v.n.side === visMode || v.n.detUntil > S.t, S.t);
  }
  // 霧隱的煙、物見範圍
  smokeAcc += gdt;
  if (smokeAcc > 0.3) { smokeAcc = 0; for (const sm of S.smokes) if (sm.until > S.t) for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 55; smoke.burst(sm.x + Math.cos(a) * r, sm.y + Math.sin(a) * r, 1, 2); } }
  smoke.update(gdt);
  // 遭放火的據點冒煙
  for (const p of S.points) if (p.burnedUntil > S.t && Math.random() < gdt * 6) {
    const a = Math.random() * 6.28, r = Math.random() * 18;
    ash.burst(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 1, 2);
    if (Math.random() < 0.6) ember.burst(p.x + Math.cos(a) * r * 0.6, p.y + Math.sin(a) * r * 0.6, 1, 1);
  }
  ash.update(gdt); ember.update(gdt);
  // 奔馳中的騎兵揚起塵土
  hoofAcc += gdt;
  if (hoofAcc > 0.12) {
    hoofAcc = 0;
    for (const v of views) if (v.galloping && v.alive && intelOf(v.u) >= 2 && !inPaddy(v.u.x, v.u.y)) {
      for (let k = 0; k < 2; k++) { const i = Math.floor(Math.random() * v.alive); hoof.burst(v.px[i] - Math.cos(v.u.f) * 1.5, v.py[i] - Math.sin(v.u.f) * 1.5, 1, 0.8, -Math.cos(v.u.f) * 0.3, -Math.sin(v.u.f) * 0.3); }
    }
  }
  hoof.update(gdt);
  areas.sync(S.monomi.filter(m => m.side === 0 && m.until > S.t).map((m, i) => ({ key: `mo${m.x | 0},${m.y | 0},${i}`, x: m.x, y: m.y, r: 150, color: '#c9a227', opacity: 0.12 })));
  hud.armyExact = WATCH ? [true, true] : [true, general(S, 0).advAlive];
  director(dt);
  if (WATCH) hud.setWatchState(camAuto && performance.now() >= manualUntil, visMode === 'all' ? '全' : visMode === 0 ? '武' : '上');
  corpses.update(gdt); arrows.update(gdt); dust.update(gdt);
  updateFloats(dt);
  pulses.update(gdt);
  // 扇區：滑鼠指著的敵軍＞選取部隊的攻擊目標；資訊面板中的部隊另外一個
  if (inspect >= 0 && S.units[inspect].state === 'gone') inspect = -1;
  if (selNin >= 0 && !S.ninjas[selNin].alive) selNin = -1;
  if (selected.size || inspect >= 0 || selNin >= 0) inspectPoint = -1;
  const infoU = selNin >= 0 ? null : infoUnit();
  const tu = selUnits().find(u => u.target >= 0 && S.units[u.target].state !== 'gone');
  const dU = hoverEnemy >= 0 && S.units[hoverEnemy].state !== 'gone' ? S.units[hoverEnemy] : tu ? S.units[tu.target] : null;
  const discAt = (d: FacingDisc, u: Unit | null) => {
    if (!u || u.state === 'gone' || intelOf(u) < 2) { d.hide(); return; }
    const c = viewOf(u.id).center(alpha); d.show(c.x, c.y, u.f, Math.max(u.width, u.depth) / 2 + 7);
  };
  discAt(discInfo, infoU && infoU.state !== 'rout' && infoU.state !== 'shattered' ? infoU : null);
  discAt(discTarget, dU && dU !== infoU ? dU : null);
  tgtRing.visible = !!tu && (dU === S.units[tu.target] || intelOf(S.units[tu.target]) === 1);
  if (tu) {
    const T = S.units[tu.target], tv = viewOf(T.id), c = tv.intel === 1 ? { x: tv.ghostX, y: tv.ghostY } : tv.center(alpha), w = toWorld(c.x, c.y);
    tgtRing.position.set(w.x, w.y + 0.5, w.z); tgtRing.scale.setScalar(Math.max(T.width, T.depth) / 2 + 4);
  }
  infoT -= dt;
  if (infoT <= 0) {
    infoT = 0.25;
    hud.setInfo(selNin >= 0 ? ninjaHtml(S.ninjas[selNin]) : infoU && infoU.id !== infoClosed ? infoHtml(infoU) : inspectPoint >= 0 ? pointHtml(inspectPoint) : null);
    if (S.holdAll[0] > 0) hud.setHold(0, 60 - S.holdAll[0]); else if (S.holdAll[1] > 0) hud.setHold(1, 60 - S.holdAll[1]); else hud.setHold(-1, 0);
    const us = selUnits().filter(u => u.skill);
    hud.setSkillReady(us.length > 0, us.some(u => skillState(u).ok));
    for (const u of S.units) if (u.side === 0) hud.setCardReady(u.id, skillState(u).ok);
    hud.updateNinjaCard(myNinjas().length, Math.max(0, S.jutsuCd[0] - S.t) / 90, CLAN_INFO[S.clan[0]].name, selNin >= 0);
  }
  for (const id of [...selected]) if (!active(S.units[id])) { selected.delete(id); views.forEach(v => (v.selected = selected.has(v.u.id))); }
  S.points.forEach((p, i) => terrain.setOwner(i, p.owner, p.prog / 20, p.progSide));
  if (marker.visible) {
    markerT += dt; const k = markerT / 0.6;
    marker.scale.setScalar(markerR ? markerR * (1.4 - k * 0.4) : 2 + k * 6); (marker.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
    if (k >= 1) marker.visible = false;
  }
  const fs = selUnits().filter(u => u.type !== 'cav' && u.type !== 'general');
  hud.update(S.t, S.army, S.units.filter(mine), selected, u => effM(S, u), paused, speed, fs.length ? FORM_NAME[fs[0].form].slice(0, 1) : '', boxMode);
  renderer.render(scene, rig.cam);
  cpu += performance.now() - t0; fpsN++; fpsT += dt;
  if (fpsT >= 0.5) {
    const fps = fpsN / fpsT;
    autoQuality(fps);
    const men = S.units.reduce((a, u) => a + (u.state === 'gone' ? 0 : u.men), 0);
    hud.setFps(fps, cpu / fpsN, men, renderer.info.render.calls, renderer.getPixelRatio());
    fpsN = 0; fpsT = 0; cpu = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 測試用：無頭瀏覽器腳本透過這個介面下指令、快轉
(window as unknown as Record<string, unknown>).__kessen = {
  S, rig, focus, setSel, orderAttack, orderMove, selectNinja, startJutsu, trySkill, screenOf, intelOf,
  advance(sec: number) {
    for (let i = 0; i < Math.round(sec / SIM_DT); i++) {
      for (const v of views) { v.prevX = v.u.x; v.prevY = v.u.y; }
      for (const v of ninViews) { v.prevX = v.n.x; v.prevY = v.n.y; }
      for (const u of S.units) menBefore[u.id] = u.men;
      step(S); afterStep();
      if (S.over) break;
    }
    for (const v of views) v.snap();
  },
  setSpeed(s: number) { speed = s; },
};
