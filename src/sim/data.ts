// 《決戰》士氣模擬器 — 遊戲資料（依 MVP 設計文件）
export type Side = 0 | 1; // 0 = 武田（南方，y 小），1 = 上杉（北方，y 大）
export type UType = 'spear' | 'archer' | 'samurai' | 'cav' | 'general' | 'gun' | 'cannon';

export const UT: Record<UType, {
  men: number; hp: number; atk: number; def: number; charge: number;
  speed: number; range: number; morale: number; cav: boolean; ammo: number;
}> = {
  spear:   { men: 60, hp: 10, atk: 6,  def: 8,  charge: 2,  speed: 3.5, range: 0,   morale: 40, cav: false, ammo: 0 },
  archer:  { men: 40, hp: 8,  atk: 3,  def: 3,  charge: 1,  speed: 3.5, range: 150, morale: 35, cav: false, ammo: 20 },
  samurai: { men: 40, hp: 12, atk: 12, def: 10, charge: 6,  speed: 4.0, range: 0,   morale: 60, cav: false, ammo: 0 },
  cav:     { men: 20, hp: 20, atk: 10, def: 8,  charge: 25, speed: 9.0, range: 0,   morale: 60, cav: true,  ammo: 0 },
  general: { men: 12, hp: 25, atk: 12, def: 12, charge: 20, speed: 8.0, range: 0,   morale: 80, cav: true,  ammo: 0 },
  gun:     { men: 30, hp: 8,  atk: 3,  def: 3,  charge: 1,  speed: 3.3, range: 120, morale: 35, cav: false, ammo: 10 }, // 鐵砲足輕：射程短、命中高、裝填慢、聲勢嚇人
  cannon:  { men: 8,  hp: 8,  atk: 1,  def: 2,  charge: 0,  speed: 1.6, range: 260, morale: 40, cav: false, ammo: 6 },  // 大筒：射程遠、每發打倒數人、恐懼效果，但極慢、近戰無力
};

export type RosterEntry = {
  key: string; type: UType; cmd: string; skill: string; passive: string;
  advisor?: string; strategy?: string; advisorPassive?: string;
};

// 武田軍（side 0）：甲州流，以騎兵與火器見長。長槍 2、武士 1、騎兵 2、弓 1、鐵砲 1（282 人）
// 將領性格（決策卡「交給他判斷」與台詞用）：bold 猛、steady 穩、cautious 慎
export type Trait = 'bold' | 'steady' | 'cautious';
export const TRAIT: Record<string, Trait> = {
  '武田信玄': 'steady', '馬場信春': 'steady', '武田信繁': 'bold', '內藤昌豐': 'cautious', '高坂昌信': 'cautious', '小山田信茂': 'steady', '山縣昌景': 'bold', '飯富虎昌': 'bold',
  '上杉謙信': 'bold', '直江景綱': 'cautious', '柿崎景家': 'bold', '甘粕景持': 'cautious', '中條藤資': 'steady', '色部勝長': 'steady', '安田長秀': 'cautious', '齋藤朝信': 'bold',
};
export const ROSTER_T: RosterEntry[] = [
  { key: 'gen', type: 'general', cmd: '武田信玄', skill: 'furin', passive: 'hitowa',
    advisor: '山本勘助', strategy: 'kitsutsuki', advisorPassive: 'heiho' },
  { key: 'spear1', type: 'spear', cmd: '馬場信春', skill: 'fujimi', passive: 'def2' },
  { key: 'samurai1', type: 'samurai', cmd: '武田信繁', skill: 'kesshi', passive: 'tenkyu' },
  { key: 'spear2', type: 'spear', cmd: '內藤昌豐', skill: 'teppeki', passive: 'cap12' },
  { key: 'archer1', type: 'archer', cmd: '高坂昌信', skill: 'kyusha', passive: 'nigedanjo' },
  { key: 'gun1', type: 'gun', cmd: '小山田信茂', skill: 'sandan', passive: 'ammo5' },
  { key: 'cav', type: 'cav', cmd: '山縣昌景', skill: 'akazonae', passive: 'flank20' },
  { key: 'cav2', type: 'cav', cmd: '飯富虎昌', skill: 'shinsa', passive: 'atk2' },
];

// 上杉軍（side 1）：越後精兵，武士多、有大筒。長槍 2、武士 2、騎兵 1、弓 1、大筒 1（280 人）
export const ROSTER_U: RosterEntry[] = [
  { key: 'gen', type: 'general', cmd: '上杉謙信', skill: 'kuruma', passive: 'bishamon',
    advisor: '宇佐美定滿', strategy: 'kanpa', advisorPassive: 'echigo' },
  { key: 'spear1', type: 'spear', cmd: '直江景綱', skill: 'koshu', passive: 'def2' },
  { key: 'samurai1', type: 'samurai', cmd: '柿崎景家', skill: 'senpo', passive: 'charge4' },
  { key: 'samurai2', type: 'samurai', cmd: '甘粕景持', skill: 'shingari', passive: 'retreat30' },
  { key: 'spear2', type: 'spear', cmd: '中條藤資', skill: 'kobu', passive: 'cap12' },
  { key: 'archer1', type: 'archer', cmd: '色部勝長', skill: 'kyusha', passive: 'ammo5' },
  { key: 'cannon1', type: 'cannon', cmd: '安田長秀', skill: 'assei', passive: 'range20' },
  { key: 'cav', type: 'cav', cmd: '齋藤朝信', skill: 'shoki', passive: 'atk2' },
];
export const isRangedType = (t: UType) => UT[t].range > 0;

export const SKILL_KIND: Record<string, 'def' | 'atk' | 'morale' | 'charge' | 'ranged' | 'main'> = {
  fujimi: 'def', teppeki: 'def', koshu: 'def',
  kesshi: 'atk', senpo: 'atk', shinsa: 'atk',
  kobu: 'morale', shingari: 'morale',
  akazonae: 'charge', shoki: 'charge',
  kyusha: 'ranged', toseki: 'ranged', assei: 'ranged', sandan: 'ranged',
  furin: 'main', kuruma: 'main',
};

export type Clan = {
  id: string; name: string; sides: Side[]; n: number;
  intel: 'low' | 'mid' | 'high'; stealth: 'low' | 'mid' | 'high';
  jutsu: [string, string];
};

export const CLANS: Record<string, Clan> = {
  mitsumono: { id: 'mitsumono', name: '三ツ者', sides: [0], n: 4, intel: 'high', stealth: 'mid', jutsu: ['rumor', 'monomi'] },
  nokizaru: { id: 'nokizaru', name: '軒猿', sides: [1], n: 4, intel: 'mid', stealth: 'high', jutsu: ['sennyu', 'sakuteki'] }, // clanPassive：jutsu[0] 是唯一主動忍術，jutsu[1] 變成自動的特性
  iga: { id: 'iga', name: '伊賀眾', sides: [0, 1], n: 3, intel: 'mid', stealth: 'mid', jutsu: ['ansatsu', 'houka'] },
  koga: { id: 'koga', name: '甲賀眾', sides: [0, 1], n: 5, intel: 'high', stealth: 'low', jutsu: ['kirigakure', 'sahou'] },
};
export const CLAN_CHOICES: Record<Side, string[]> = { 0: ['mitsumono', 'iga', 'koga'], 1: ['nokizaru', 'iga', 'koga'] };
export const STEALTH_R = { high: 20, mid: 40, low: 60 };

// 地圖：1000 m（x，東西）× 700 m（y，南北）。武田在南（y 小），上杉在北（y 大）。
// 溪流（可由規則 streams 選用）：中心線折線、寬度、渡口（圓）。two：兩軍各有一條在自己對峙線前方，攻方要涉水；east：東側一條南北向，補給點在渡口
export type Stream = { pts: [number, number][]; w: number; fords: { x: number; y: number; r: number; name?: string }[] };
export const STREAMS: Record<string, Stream[]> = {
  none: [],
  // 千曲川：從左上（西南）斜貫到右下（東北），渡口：雨宮の渡し（上杉渡河處）、十二ヶ瀬（別働隊渡河處）、小森の渡し
  chikuma: [
    { pts: [[-320, 640], [-150, 600], [0, 560], [120, 540], [260, 520], [400, 490], [520, 470], [640, 440], [760, 400], [860, 330], [930, 230], [990, 120], [1080, -40], [1160, -320]], w: 34,
      fords: [{ x: 260, y: 520, r: 22, name: '雨宮の渡し' }, { x: 640, y: 440, r: 20, name: '十二ヶ瀬' }, { x: 880, y: 300, r: 18, name: '小森の渡し' }] },
  ],
  two: [
    { pts: [[0, 284], [120, 296], [250, 286], [380, 298], [500, 290], [620, 282], [760, 296], [880, 286], [1000, 292]], w: 14, fords: [{ x: 500, y: 290, r: 16 }, { x: 290, y: 289, r: 12 }, { x: 760, y: 296, r: 12 }] },
    { pts: [[0, 416], [120, 404], [250, 414], [380, 402], [500, 410], [620, 418], [760, 404], [880, 414], [1000, 408]], w: 14, fords: [{ x: 500, y: 410, r: 16 }, { x: 290, y: 411, r: 12 }, { x: 760, y: 404, r: 12 }] },
  ],
  east: [
    { pts: [[912, 0], [898, 120], [910, 240], [896, 350], [908, 460], [894, 580], [906, 700]], w: 16, fords: [{ x: 896, y: 350, r: 18 }, { x: 898, y: 120, r: 12 }, { x: 894, y: 580, r: 12 }] },
  ],
};
// 地圖：八幡原（第四次川中島之戰，1561 年 9 月 10 日）。座標 1000×700 m，y 往上為西南（上杉來的方向），右側為北（犀川）。
// 武田在八幡原（下方中央）面向西南；上杉在千曲川對岸（左上，妻女山山腳）渡雨宮の渡し而來。距離約為實地的 1/3。不再南北對稱。
export type Rect = { x0: number; x1: number; y0: number; y1: number };
export const MAP = {
  W: 1000, H: 700,
  hill: { x: 500, y: 210, r: 130, h: 4 }, // 八幡原微高地（相容舊程式）
  hills: [
    { x: 500, y: 210, r: 130, h: 4 },   // 八幡原
    { x: 210, y: 650, r: 200, h: 40 },  // 妻女山（上杉宿營地，高地視野）
    { x: 890, y: 670, r: 150, h: 28 },  // 茶臼山
    { x: 660, y: 330, r: 70, h: 3 },    // 丹波島附近的微高
  ],
  forests: [
    { x0: 30, x1: 340, y0: 570, y1: 700 },   // 妻女山山林
    { x0: 790, x1: 1000, y0: 600, y1: 700 }, // 茶臼山山林
    { x0: 560, x1: 640, y0: 455, y1: 500 },  // 河原林（十二ヶ瀬西側）
    { x0: 120, x1: 200, y0: 470, y1: 520 },  // 河原林（雨宮の渡し東側）
  ] as Rect[],
  forest: { x0: 30, x1: 340, y0: 570, y1: 700 }, // 相容：第一片森林
  paddies: [
    { x0: 660, x1: 810, y0: 270, y1: 400 },  // 丹波島東側的晚稻田（仍泥濘）
    { x0: 130, x1: 250, y0: 290, y1: 400 },  // 小島田西側
    { x0: 420, x1: 560, y0: 455, y1: 520 },  // 河原濕地（十二ヶ瀬與雨宮之間）
  ] as Rect[],
  paddy: { x0: 660, x1: 810, y0: 270, y1: 400 }, // 相容：第一片
  points: [
    { id: 'village', x: 330, y: 345 },  // 小島田（援軍）
    { id: 'temple', x: 500, y: 300 },   // 八幡社（士氣）
    { id: 'supply', x: 700, y: 335 },   // 丹波島（補給）
  ],
  pointR: 40,
  // 兩軍基點（己方座標 yl）與對峙線：武田在八幡原、上杉在千曲川對岸（妻女山山腳）
  base: [{ x: 500, yl: 160 }, { x: 330, yl: 40 }],
  holdYl: [280, 110],
  // 地形秘密候選位置（每局隨機抽出）：沼澤在河原，伏兵在山林與河原林
  marshCand: [{ x: 480, y: 500 }, { x: 560, y: 480 }, { x: 700, y: 430 }, { x: 820, y: 375 }, { x: 360, y: 505 }],
  marshR: 35,
  trailCand: [110, 230], // 妻女山山林裡的小徑 x
  ambushCand: [{ x: 150, y: 610 }, { x: 260, y: 600 }, { x: 600, y: 478 }, { x: 160, y: 495 }],
  ambushR: 30,
  names: { village: '小島田', temple: '八幡社', supply: '丹波島' } as Record<string, string>,
  // 別働隊：開戰時不在場的武田部隊（上妻女山撲空），之後從妻女山方向（上方）渡十二ヶ瀬夾擊上杉背後
  detach: { side: 0 as Side, keys: ['archer1', 'gun1', 'cav2'], entry: { x: 430, y: 690 } },
  aggr: [1, 1.15] as [number, number], // 侵略性倍率：上杉是渡河來攻的一方
};
