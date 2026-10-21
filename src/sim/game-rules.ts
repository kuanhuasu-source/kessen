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
  archerRange: 200,      // 弓兵射程 150 → 200 m（＝識別距離）
  name: 'game',
});
export const SIM_DT = 0.1; // 模擬固定步長（秒）
