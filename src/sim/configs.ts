// 實驗設定：v1（設計文件現行規則）、消融測試、v2 調整階梯與 v2 消融
import type { Rules } from './rules.ts';
type Over = Partial<Rules>;

// ---- v2 調整（逐組疊加，每組對應報告中的一項建議） ----
const G1_SHOCK: Over = { shockCap: 30, kitsutsukiMoraleMult: 1, shinsaMult: 1.5, akazonaeExtra: -5, kurumaExtra: -5 };
const G2_LOSS: Over = { lossEscAt: 5, lossStep2: -15, batteredFrac: 0.3 };
const G3_CMD: Over = { cmdKillOnlyRouting: true };
const G4_GEN: Over = { bannerReplaces: true, advisorEscape: true, aCap10s: 30 };
const G5_LOOP: Over = { armyLowPer10s: 0, friendlyRoutCd: 20, aRally: 0, aRout: -12, collapseAt: 25 };
const G6_FAC: Over = { hitowaRegen: 1 };

export const V2: Over = { ...G1_SHOCK, ...G2_LOSS, ...G3_CMD, ...G4_GEN, ...G5_LOOP, ...G6_FAC };
const v2 = (o: Over): Over => ({ ...V2, ...o });

export const CONFIGS: Record<string, Over> = {
  v1: {},
  v1_docpace: { meleeInterval: 1.2, arrowDmg: 5 },
  v2: V2,
  // ---- 階梯 ----
  L1_shock: { ...G1_SHOCK },
  L2_loss: { ...G1_SHOCK, ...G2_LOSS },
  L3_cmd: { ...G1_SHOCK, ...G2_LOSS, ...G3_CMD },
  L4_gen: { ...G1_SHOCK, ...G2_LOSS, ...G3_CMD, ...G4_GEN },
  L5_loop: { ...G1_SHOCK, ...G2_LOSS, ...G3_CMD, ...G4_GEN, ...G5_LOOP },
  // ---- v1 消融：部隊士氣事件 ----
  no_losses: { lossStep: 0 },
  no_flankrear: { flank: 0, rear: 0 },
  no_surround: { surroundPerSec: 0 },
  no_chargeHit: { chargeHit: 0 },
  no_volley: { volley: 0 },
  no_friendRout: { friendlyRout: 0 },
  no_enemyRoutNear: { enemyRoutNear: 0 },
  no_armyLow: { armyLowPer10s: 0 },
  no_armyHigh: { armyHighPer10s: 0 },
  no_killCmd: { killCmd: 0 },
  no_regen: { regenPer5s: 0 },
  no_highState: { highAtkPct: 0, highCharge: 0 },
  no_genAura: { genAura: 0 },
  no_temple: { templeAura: 0 },
  no_cry: { cryOn: false },
  no_cmdDeath: { cmdDeathOn: false },
  // ---- v1 消融：軍勢事件 ----
  no_bannerFall: { aBannerFall: 0 },
  no_aPoints: { aPointGain: 0, aPointLost: 0 },
  // ---- v1 消融：系統 ----
  no_skills: { skillsOn: false },
  no_strategy: { strategyOn: false },
  no_ninja: { ninjaOn: false },
  no_fog: { fogOn: false },
  no_passives: { passivesOn: false },
  // ---- v1 消融：技能中的士氣成分（複合條件） ----
  no_furinFloor: { furinFloor: 0 },
  no_shingariFloor: { shingariFloorOn: false },
  no_kitsutsukiX2: { kitsutsukiMoraleMult: 1 },
  no_shinsaX2: { shinsaMult: 1 },
  no_chargeExtras: { kurumaExtra: 0, akazonaeExtra: 0 },
  no_rumor: { rumor: 0, rumorNoRegen: 0 },
  no_hitowaRegen: { hitowaRegen: 1 },
  sym: { passivesOn: false, skillsOn: false, strategyOn: false, ninjaOn: false, fogOn: false },
  // ---- v2 消融 ----
  v2_no_losses: v2({ lossStep: 0, lossStep2: 0 }),
  v2_no_flankrear: v2({ flank: 0, rear: 0 }),
  v2_no_chargeHit: v2({ chargeHit: 0 }),
  v2_no_cry: v2({ cryOn: false }),
  v2_no_friendRout: v2({ friendlyRout: 0 }),
  v2_no_genAura: v2({ genAura: 0 }),
  v2_no_temple: v2({ templeAura: 0 }),
  v2_no_armyHigh: v2({ armyHighPer10s: 0 }),
  v2_no_regen: v2({ regenPer5s: 0 }),
  v2_no_skills: v2({ skillsOn: false }),
  v2_no_strategy: v2({ strategyOn: false }),
  v2_no_ninja: v2({ ninjaOn: false }),
  v2_no_furinFloor: v2({ furinFloor: 0 }),
  v2_no_shingariFloor: v2({ shingariFloorOn: false }),
  v2_no_cmdDeath: v2({ cmdDeathOn: false }),
  v2_no_rumor: v2({ rumor: 0, rumorNoRegen: 0 }),
  v2_no_passives: v2({ passivesOn: false }),
  v2_nk_high: v2({ nokizaruIntel: 'high' }),
  v2_nk_nogisei: v2({ giseiOn: false }),
  v2_nk_both: v2({ nokizaruIntel: 'high', giseiOn: false }),
  v2_nk_protect: v2({ giseiProtect: true }),
  v2_ninT: v2({ ninjaSides: [true, false] }),
  v2_ninU: v2({ ninjaSides: [false, true] }),
  v2_nojutsu: v2({ offJutsu: ['rumor', 'monomi', 'gisei', 'sakuteki', 'ansatsu', 'houka', 'kirigakure', 'sahou'] }),
  v2_j_rumor: v2({ offJutsu: ['rumor'] }), v2_j_monomi: v2({ offJutsu: ['monomi'] }),
  v2_j_gisei: v2({ offJutsu: ['gisei'] }), v2_j_sakuteki: v2({ offJutsu: ['sakuteki'] }),
  v2_j_ansatsu: v2({ offJutsu: ['ansatsu'] }), v2_j_houka: v2({ offJutsu: ['houka'] }),
  v2_j_kirigakure: v2({ offJutsu: ['kirigakure'] }), v2_j_sahou: v2({ offJutsu: ['sahou'] }),
  v2_ninfix: v2({ giseiOn: false, insightR: 60, assassinP: 0.15, assassinPIdle: 0.25 }),
  v3a: v2({ giseiOn: false, insightR: 60, assassinP: 0.10, assassinPIdle: 0.20, assassinFailKills: true }),
  v3b: v2({ giseiOn: false, insightR: 60, assassinP: 0.10, assassinPIdle: 0.20, assassinFailKills: true, sennyuOn: true }),
  v2_cb_enemyRout0: v2({ aEnemyRout: 0 }),
  v2_cb_loss10: v2({ lossStep2: -10 }),
  v2_cb_both: v2({ aEnemyRout: 0, armyHighPer10s: 0 }),
  v2_cb_esc6: v2({ lossEscAt: 6 }),
};
