// 兵種的漢字與名稱（介面與旗幟共用）
import type { UType } from '../sim/data.ts';
export const KANJI: Record<UType, string> = { spear: '槍', archer: '弓', samurai: '侍', cav: '騎', general: '將', gun: '銃', cannon: '砲' };
export const TYPE_NAME: Record<UType, string> = { spear: '長槍足輕', archer: '弓足輕', samurai: '武士刀武士', cav: '騎馬武士', general: '大將旗本', gun: '鐵砲足輕', cannon: '大筒' };
