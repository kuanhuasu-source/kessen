// 遊戲採用的規則：v1（設計文件）＋ v2 士氣調整 ＋ v3 忍者調整
import { makeRules } from './rules.ts';
import { V2 } from './configs.ts';

export const GAME_RULES = makeRules({
  ...V2,
  giseiOn: false, sennyuOn: true, insightR: 60,
  assassinP: 0.10, assassinPIdle: 0.20, assassinFailKills: true,
  // 2026-10-21 節奏調整（AI 對 AI 各 60 場：交戰期 330 → 298 秒、總崩潰結束 62% → 87%）
  rallyCap: 50,          // 重整後士氣最高回到 50（再潰走即潰滅）
  aiRetreat: false,      // 取消 AI 動搖時的有序撤退（每場平均 6 次來回）
  aiGenBack: 40, aiGenCommit: true, // 主將站在戰線後 40 m（光環 60 m 能蓋到前線），並追擊附近動搖或潰走的敵軍
  aiSteady: true,        // 止抖：目標鎖 8 秒、決策遲滯（目標切換 −80%、主將回頭 −60%，節奏不變）
  aiLine: true,          // 戰線式指揮：整條線推進、弓兵在線後、步兵各打正前方、騎兵等接戰後繞翼（AI 對 AI 60 場：時長 298 秒、首戰 102 秒、交戰期 197 秒、總崩潰結束 87%、時間到 8%、據點 5%、武田勝 55%（修正對峙線卡在半路的 bug 後；修正前 334 秒／首戰 126 秒／武田 63%））
  aiFormation: 'line',   // 一字橫陣（鶴翼量測：crane 武田勝 63%、據點結束 18%；craneT 武田勝 42%，先不用）
  archerRange: 200,      // 弓兵射程 150 → 200 m
  fogV2: true,           // 情報 v2（2026-10-21）：部隊察覺 130／識別 80 m、忍者 190／110 m、識別要累積觀察 8 秒、洞悉 12 秒、識別 40 秒後退化、察覺 120 秒後遺忘、地形秘密要靠到 15 m、忍者 4.5 m/s 掃描偵察、開戰只知己方半場秘密、不做針對性佈陣
  // 2026-10-21 地形與反一團（AI 對 AI 60 場、策略模擬各 60 局）
  streams: 'two', // 兩條溪流（各在對峙線前），渡口在大路與兩翼
  aiHoldYl: 280, deployFwd: 50, aiFormRun: true, aiAttackT0: 10, aiAttackTR: 30, aiAnchorSpd: 3.8, aiVolleyDur: 12, // 回顧（2026-10-22）開場節奏 A：佈陣前移 50、急行軍成線、攻勢 10～40 秒、對峙線 280（溪前）、錨點 3.8 m/s、對射 12 秒 → 首戰 88 → 57 秒
  reliefNoise: 0.4,              // 緩坡起伏降到 ±0.7 m（滿幅會讓時間到從 12% 升到 20%）
  pointWin: false,       // 回顧（2026-10-22）：據點勝利只佔 5%，拿掉；據點只給增益
  gunHit: 0.4, gunDmg: 4, cannonLam: 2.6, cannonReload: 25, cannonDmg: 12, cannonSplash: 0.6, // 鐵砲／大筒平衡（2026-10-22）：預設值武田 83%，此組 52%
  arrowSplash: 0.5, crowdSlow: 0.25, aiFlankReact: true, // 箭雨濺射、擁擠減速、AI 側擊反應：一團 48%→33%、疊放 50%→27%、鶴翼 38%→57%
  name: 'game',
});
export const SIM_DT = 0.1; // 模擬固定步長（秒）
