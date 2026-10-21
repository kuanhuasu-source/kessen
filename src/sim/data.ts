// 《決戰》士氣模擬器 — 遊戲資料（依 MVP 設計文件）
export type Side = 0 | 1; // 0 = 武田（南方，y 小），1 = 上杉（北方，y 大）
export type UType = 'spear' | 'archer' | 'samurai' | 'cav' | 'general';

export const UT: Record<UType, {
  men: number; hp: number; atk: number; def: number; charge: number;
  speed: number; range: number; morale: number; cav: boolean; ammo: number;
}> = {
  spear:   { men: 60, hp: 10, atk: 6,  def: 8,  charge: 2,  speed: 3.5, range: 0,   morale: 40, cav: false, ammo: 0 },
  archer:  { men: 40, hp: 8,  atk: 3,  def: 3,  charge: 1,  speed: 3.5, range: 150, morale: 35, cav: false, ammo: 20 },
  samurai: { men: 40, hp: 12, atk: 12, def: 10, charge: 6,  speed: 4.0, range: 0,   morale: 60, cav: false, ammo: 0 },
  cav:     { men: 20, hp: 20, atk: 10, def: 8,  charge: 25, speed: 9.0, range: 0,   morale: 60, cav: true,  ammo: 0 },
  general: { men: 12, hp: 25, atk: 12, def: 12, charge: 20, speed: 8.0, range: 0,   morale: 80, cav: true,  ammo: 0 },
};

export type RosterEntry = {
  key: string; type: UType; cmd: string; skill: string; passive: string;
  advisor?: string; strategy?: string; advisorPassive?: string;
};

// 武田軍（side 0）
export const ROSTER_T: RosterEntry[] = [
  { key: 'gen', type: 'general', cmd: '武田信玄', skill: 'furin', passive: 'hitowa',
    advisor: '山本勘助', strategy: 'kitsutsuki', advisorPassive: 'heiho' },
  { key: 'spear1', type: 'spear', cmd: '馬場信春', skill: 'fujimi', passive: 'def2' },
  { key: 'spear2', type: 'spear', cmd: '內藤昌豐', skill: 'teppeki', passive: 'cap12' },
  { key: 'archer1', type: 'archer', cmd: '高坂昌信', skill: 'kyusha', passive: 'nigedanjo' },
  { key: 'archer2', type: 'archer', cmd: '小山田信茂', skill: 'toseki', passive: 'ammo5' },
  { key: 'samurai1', type: 'samurai', cmd: '武田信繁', skill: 'kesshi', passive: 'tenkyu' },
  { key: 'samurai2', type: 'samurai', cmd: '飯富虎昌', skill: 'shinsa', passive: 'atk2' },
  { key: 'cav', type: 'cav', cmd: '山縣昌景', skill: 'akazonae', passive: 'flank20' },
];

// 上杉軍（side 1）
export const ROSTER_U: RosterEntry[] = [
  { key: 'gen', type: 'general', cmd: '上杉謙信', skill: 'kuruma', passive: 'bishamon',
    advisor: '宇佐美定滿', strategy: 'kanpa', advisorPassive: 'echigo' },
  { key: 'spear1', type: 'spear', cmd: '直江景綱', skill: 'koshu', passive: 'def2' },
  { key: 'spear2', type: 'spear', cmd: '中條藤資', skill: 'kobu', passive: 'cap12' },
  { key: 'archer1', type: 'archer', cmd: '色部勝長', skill: 'kyusha', passive: 'ammo5' },
  { key: 'archer2', type: 'archer', cmd: '安田長秀', skill: 'assei', passive: 'range20' },
  { key: 'samurai1', type: 'samurai', cmd: '柿崎景家', skill: 'senpo', passive: 'charge4' },
  { key: 'samurai2', type: 'samurai', cmd: '甘粕景持', skill: 'shingari', passive: 'retreat30' },
  { key: 'cav', type: 'cav', cmd: '齋藤朝信', skill: 'shoki', passive: 'atk2' },
];

export const SKILL_KIND: Record<string, 'def' | 'atk' | 'morale' | 'charge' | 'ranged' | 'main'> = {
  fujimi: 'def', teppeki: 'def', koshu: 'def',
  kesshi: 'atk', senpo: 'atk', shinsa: 'atk',
  kobu: 'morale', shingari: 'morale',
  akazonae: 'charge', shoki: 'charge',
  kyusha: 'ranged', toseki: 'ranged', assei: 'ranged',
  furin: 'main', kuruma: 'main',
};

export type Clan = {
  id: string; name: string; sides: Side[]; n: number;
  intel: 'low' | 'mid' | 'high'; stealth: 'low' | 'mid' | 'high';
  jutsu: [string, string];
};

export const CLANS: Record<string, Clan> = {
  mitsumono: { id: 'mitsumono', name: '三ツ者', sides: [0], n: 4, intel: 'high', stealth: 'mid', jutsu: ['rumor', 'monomi'] },
  nokizaru: { id: 'nokizaru', name: '軒猿', sides: [1], n: 4, intel: 'mid', stealth: 'high', jutsu: ['gisei', 'sakuteki'] },
  iga: { id: 'iga', name: '伊賀眾', sides: [0, 1], n: 3, intel: 'mid', stealth: 'mid', jutsu: ['ansatsu', 'houka'] },
  koga: { id: 'koga', name: '甲賀眾', sides: [0, 1], n: 5, intel: 'high', stealth: 'low', jutsu: ['kirigakure', 'sahou'] },
};
export const CLAN_CHOICES: Record<Side, string[]> = { 0: ['mitsumono', 'iga', 'koga'], 1: ['nokizaru', 'iga', 'koga'] };
export const STEALTH_R = { high: 20, mid: 40, low: 60 };

// 地圖：1000 m（x，東西）× 700 m（y，南北）。武田在南（y 小），上杉在北（y 大）。
// 溪流（可由規則 streams 選用）：中心線折線、寬度、渡口（圓）。two：兩軍各有一條在自己對峙線前方，攻方要涉水；east：東側一條南北向，補給點在渡口
export type Stream = { pts: [number, number][]; w: number; fords: { x: number; y: number; r: number }[] };
export const STREAMS: Record<string, Stream[]> = {
  none: [],
  two: [
    { pts: [[0, 284], [120, 296], [250, 286], [380, 298], [500, 290], [620, 282], [760, 296], [880, 286], [1000, 292]], w: 14, fords: [{ x: 500, y: 290, r: 16 }, { x: 290, y: 289, r: 12 }, { x: 760, y: 296, r: 12 }] },
    { pts: [[0, 416], [120, 404], [250, 414], [380, 402], [500, 410], [620, 418], [760, 404], [880, 414], [1000, 408]], w: 14, fords: [{ x: 500, y: 410, r: 16 }, { x: 290, y: 411, r: 12 }, { x: 760, y: 404, r: 12 }] },
  ],
  east: [
    { pts: [[912, 0], [898, 120], [910, 240], [896, 350], [908, 460], [894, 580], [906, 700]], w: 16, fords: [{ x: 896, y: 350, r: 18 }, { x: 898, y: 120, r: 12 }, { x: 894, y: 580, r: 12 }] },
  ],
};
export const MAP = {
  W: 1000, H: 700,
  hill: { x: 500, y: 350, r: 160, h: 15 },
  forest: { x0: 0, x1: 260, y0: 230, y1: 470 },
  paddy: { x0: 650, x1: 830, y0: 250, y1: 450 },
  points: [
    { id: 'village', x: 320, y: 350 },
    { id: 'temple', x: 500, y: 350 },
    { id: 'supply', x: 890, y: 350 },
  ],
  pointR: 40,
  // 地形秘密候選位置（每局隨機抽出）
  marshCand: [{ x: 690, y: 300 }, { x: 690, y: 400 }, { x: 790, y: 290 }, { x: 790, y: 410 }, { x: 740, y: 350 }],
  marshR: 35,
  trailCand: [110, 200], // 森林中南北向小徑的 x，寬 14 m
  ambushCand: [{ x: 230, y: 290 }, { x: 230, y: 410 }, { x: 140, y: 310 }, { x: 140, y: 390 }],
  ambushR: 30,
};
