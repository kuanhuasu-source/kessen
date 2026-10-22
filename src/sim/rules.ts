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
  kogaVision: 1.3,       // 甲賀眾視野倍率
  streams: 'none' as 'none' | 'two' | 'east', // 戰場溪流（data.ts STREAMS）
  pointWin: true,        // 控制全部據點 60 秒獲勝（遊戲 2026-10-22 起關閉：據點只給增益）
  cmdCommitMorale: 0, cmdChargeMorale: 0,
  cmdRelieveN: 1, cmdRaidCharge: 0, cmdRaidShock: 0, cmdFocusMorale: 0, cmdFocusHit: 1, cmdRegroupMorale: 0, // cmdFocusHit：集火令下對目標的命中倍率 // 大名令加強（方案一）：馳援派幾隊、繞後令下的騎兵衝鋒加成與接觸額外士氣、集火每輪額外士氣、整頓時動搖與撤退中的部隊 +N 士氣 // 大名令附帶士氣：主將親征時主將 80 m 內友軍 +N、全軍突擊時全軍 +N（0＝只改行為）
  gunDmg: 5, gunReload: 15, gunVolley: -3, gunHit: 0.5,          // 鐵砲：每發命中傷害、裝填秒數、每輪士氣打擊（60 m 內命中 50%，射程邊 25%）
  cannonDmg: 10, cannonReload: 40, cannonVolley: -8, cannonTerror: -3, cannonMin: 60, cannonLam: 1.8, cannonSplash: 0, // cannonLam：150 m 內每發期望彈數；cannonSplash：目標 20 m 內其他敵隊各吃這個期望彈數（跳彈） // 大筒：每發 1～3 彈各 10 傷害、士氣 −8、30 m 內其他敵隊 −3、60 m 內無法射擊
  reliefNoise: 1,        // 地形緩坡起伏倍率（0 = 平地）
  reliefHills: true,     // 是否有寺廟小丘以外的高地
  arrowSplash: 0,        // 箭雨濺射：目標 15 m 內的其他敵隊也吃到這個比例的命中（密集隊形吃箭）
  crowdSlow: 0,          // 擁擠減速：20 m 內有 2 隊以上友軍時速度打的折扣
  aiFlankReact: false,   // AI：友軍兩隊以上接戰時，空手部隊到 200 m 外側擊（對付集中突破）
  frontageCap: false,    // 正面寬度上限：同一目標同時被打的人數受其周長限制（防止全軍疊在一起圍毆）
  unitSeparation: false, // 友軍不重疊：部隊太靠近會被推開
  fogV2: false,          // 情報 v2：視野縮小、識別要觀察一段時間、情報會隨時間退化、開戰不知敵方佈陣
  v2UnitSpot: 130, v2UnitSee: 80,    // 部隊：察覺／識別距離（m）
  v2NinSpot: 190, v2NinSee: 110,     // 忍者：察覺／識別距離
  v2IdentT: 8, v2InsightT: 12,       // 識別要在識別距離內累積觀察秒數；洞悉要忍者在 insightR 內累積秒數
  v2Decay2: 40, v2Decay1: 120,       // 沒再看到後，識別退為察覺、察覺退為未知的秒數
  v2SecretR: 15,                     // 地形秘密要靠到多近才發現（原本 +50）
  v2NinSpeed: 4.5,                   // v2 忍者移動速度（m/s；v1 為 6，潛行要慢）
  waterSpeed: 0.5, fordSpeed: 0.8, // 涉水／渡口的移動倍率
  waterArrow: 1.3,       // 水中受箭命中倍率
  waterHit: -10,         // 半渡而擊：攻擊水中（非渡口）的部隊，接觸時額外士氣打擊
  aiHoldYl: 295,         // AI 戰線式指揮的對峙線（己方座標）
  aiAttackT0: 30, aiAttackTR: 80, aiAnchorSpd: 3.3, deployFwd: 0, aiFormRun: false, aiVolleyDur: 20,
  daimyoPassive: false,  // 大名模式：玩家方的 AI 只守線，側擊鄰隊對手與騎兵繞後要靠大名令（讓玩家的介入有價值）
  daimyoPassiveCav: false, // 只有騎兵繞後要靠大名令（側擊反應保留） // deployFwd：兩軍佈陣整體前移（m）；aiFormRun：成線階段用跑的 // 戰線式 AI 發起攻勢的時間（秒，aiAttackT0 + 亂數 × aiAttackTR，再除以侵略性）與錨點推進速度（m/s）
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
  kanpaOn: true, kanpaDur: 20, kitsutsukiDur: 30, // 看破封技秒數、啄木鳥持續秒數
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
