// 規則參數。V1 = 設計文件目前的數值；其他設定以覆寫方式產生。
export type Rules = typeof V1;

export const V1 = {
  name: 'v1',
  // ---- 戰鬥節奏 ----
  // 設計文件原值為每 1.2 秒攻擊一次、近戰命中 4、箭矢命中 5：一局中位數只有 3.5 分鐘。
  // 模擬以「每 4 秒一次、箭矢 2」作為校準後的節奏（見報告），士氣規則仍是設計文件原值。
  meleeInterval: 4, meleeDmg: 4, frontRanks: 2, arrowDmg: 2,
  // ---- 部隊士氣事件 ----
  lossStep: -5,          // 兵力每損失 10%
  flank: -10,            // 被側面攻擊（接觸瞬間）
  rear: -20,             // 被背面攻擊（接觸瞬間）
  surroundPerSec: -1,    // 被包圍時每秒
  surroundMinDirs: 2,    // 同時在幾個方向接戰才算包圍
  chargeHit: -8,         // 被騎兵衝鋒接觸
  volley: -1,            // 每遭受一輪箭雨
  friendlyRout: -10,     // 附近友軍潰逃
  friendlyRoutR: 60,
  friendlyRoutCd: 0,     // v2：同一部隊在此秒數內只承受一次友軍潰逃懲罰（0 = 不限）
  cmdDeathUnit: -15,     // 本隊武將陣亡
  killCmd: 15,           // 討取敵方武將
  enemyRoutNear: 5,      // 鄰近敵軍潰逃
  genAura: 10, genAuraR: 60, bishamonR: 90,
  templeAura: 10, templeR: 80,
  tenkyuAura: 5, tenkyuR: 60,
  contCap: 999,          // v2：持續加成合計上限
  regenPer5s: 1,
  armyLowThresh: 50, armyLowPer10s: -1,
  armyHighThresh: 80, armyHighPer10s: 1,
  shockCap: 0,
  lossEscAt: 10,         // v2：損失超過此步數（每步 10%）後改用 lossStep2
  lossStep2: -5,
  batteredFrac: 0,       // v2：兵力低於此比例時，持續加成失效（0 = 不啟用）
  regenEngagedBlock: true,           // v2：單一部隊 5 秒內「瞬間事件」士氣損失上限（0 = 不限）
  // ---- 軍勢事件 ----
  aRout: -8, aShatter: -5, aViceDeath: -5, aAdvisorDeath: -8, aGenDeath: -25,
  aBannerFall: -15,      // 馬印倒下（大將旗本潰逃），與 aRout 疊加
  bannerReplaces: false, // v2：馬印倒下取代一般潰逃扣分，不再疊加
  advisorEscape: false,  // v2：旗本全滅時軍師脫身，不陣亡
  aPointLost: -5, aPointGain: 5, aEnemyRout: 4, aRally: 4,
  aCap10s: 0,            // v2：軍勢 10 秒內損失上限（0 = 不限）
  collapseAt: 20,
  // ---- 狀態 ----
  highAt: 80, highAtkPct: 0.10, highCharge: 5,
  waverAt: 50, waverAtkPct: -0.15,
  routAt: 25, rallyAt: 35, rallyWait: 15, rallyWaitNige: 8,
  maxRouts: 2,           // 第幾次潰逃即崩潰
  rallyCap: 0,
  rallyNearGen: 0,       // >0：潰走部隊須在主將此距離內才能重整（主將收容敗兵）           // 重整後士氣（含回復）上限；0 = 不限
  aiRetreat: true,       // AI：動搖且接戰中、大將不在附近時有序撤退
  aiGenBack: 70,         // AI：主將站在戰線後方的距離（m）
  aiGenCommit: false,    // AI：主將主動追擊 120 m 內動搖／潰走的敵軍（附近沒有敵長槍時）
  aiSteady: false,       // AI：止抖（目標鎖定 8 秒、主將與弓兵決策有遲滯、騎兵退衝至少隔 25 秒、長槍陣型遲滯）
  aiLine: false,         // AI：戰線式指揮（整條線一起推進、弓兵先射、步兵各打正前方、騎兵等接戰後繞翼、空手的部隊側擊鄰隊的對手）
  aiFormation: 'line',   // 戰線形狀：line 一字橫陣；crane 鶴翼（兩翼前伸）；craneT／craneU 只有武田／上杉用鶴翼
  archerRange: 150,      // 弓兵射程（m）；命中率在 50 m 以內最高，到射程邊緣降到 15%
  // ---- 鬨聲 ----
  cryOn: true, cryOwn: 10, cryEnemy: -5, cryR: 40, cryCd: 90,
  cryMinMorale: 0,       // v2：士氣高於此值才能發出鬨聲（0 = 不限）
  // ---- 武將技、軍略、忍者 ----
  skillsOn: true, strategyOn: true, ninjaOn: true, fogOn: true,
  cmdDeathOn: true,
  passivesOn: true,
  hitowaStart: 5,        // 人は城：起始士氣加成
  hitowaRegen: 2,        // 人は城：未接戰回復倍率
  nokizaruIntel: 'mid' as 'low' | 'mid' | 'high',
  cmdKillChance: 0.05,
  cmdKillOnlyRouting: false, // v2：只有在部隊潰逃被追擊時才可能被討取   // 兵力 < 25% 時，每名接戰敵隊每秒的討取機率
  buffCapPct: 0.5,
  // 個別技能的士氣成分（可在 v2 調整）
  furinFloor: 50,        // 風林火山：接戰部隊士氣下限（0 = 無）
  furinDmpPct: 0,        // v2 替代：風林火山期間士氣損失減少比例
  shingariFloorOn: true, // 殿軍：不會潰逃
  shingariDmpPct: 0,     // v2 替代
  kurumaExtra: -10, akazonaeExtra: -10,
  kitsutsukiMoraleMult: 2, // 啄木鳥戰法：側背士氣打擊倍率
  shinsaMult: 2,         // 震懾：傷亡士氣打擊倍率
  kesshiEnd: -10,
  kobu: 20,
  rumor: -15, rumorNoRegen: 30,
  tosekiMorale: -5,
  houkaArmy: -3,
  assassinP: 0.25, assassinPIdle: 0.40,
  kanpaOn: true,
  giseiOn: true,
  giseiProtect: false,   // v2：偽旗改為把弓兵偽裝成長槍（保護用），而非把長槍偽裝成弓兵（誘敵）
  offPassives: [] as string[],
  counterDeploy: true,
  ninjaSides: [true, true] as [boolean, boolean], // 哪一方有忍者
  offJutsu: [] as string[],
  insightR: 40,
  assassinFailKills: false, // 暗殺失敗時執行的忍者陣亡
  sennyuOn: false,          // 軒猿新忍術「潛入」：指定一隊敵軍，60 秒內持續洞悉          // 忍者取得洞悉的距離                        // 停用的忍術
};

export function makeRules(over: Partial<Rules> & { name: string }): Rules {
  return { ...V1, ...over };
}
