// 武將技、被動、軍略、忍術的名稱與說明（數值依遊戲規則 v2＋v3）
export const SKILL: Record<string, { name: string; desc: string; target?: number }> = {
  furin: { name: '風林火山', desc: '全軍 20 秒移動 +20%；接戰部隊防禦 +3、士氣不低於 50' },
  fujimi: { name: '不死身', desc: '10 秒內受到的傷害減半' },
  teppeki: { name: '鐵壁', desc: '立即改為槍衾；15 秒內被側擊不扣士氣' },
  koshu: { name: '固守', desc: '15 秒防禦 +5，正面衝鋒無效' },
  kyusha: { name: '急射', desc: '15 秒內裝填時間減半' },
  sandan: { name: '三段撃ち', desc: '鐵砲 15 秒內裝填時間減半' },
  toseki: { name: '投石', desc: '對 50 m 內最近的敵軍追加一輪攻擊，目標士氣 −5', target: 50 },
  assei: { name: '壓制', desc: '目標 15 秒移動 −30%', target: 170 },
  kesshi: { name: '決死', desc: '20 秒攻擊 +30%，結束時士氣 −10' },
  senpo: { name: '先鋒', desc: '20 秒攻擊 +30%，結束時士氣 −10' },
  shinsa: { name: '震懾', desc: '15 秒內本隊造成的傷亡，士氣打擊 ×1.5' },
  akazonae: { name: '赤備衝鋒', desc: '15 秒移動 +30%、衝鋒 +15，衝鋒接觸時敵士氣再 −5' },
  shoki: { name: '鍾馗突擊', desc: '15 秒移動 +30%、衝鋒 +15，衝鋒接觸時敵士氣再 −5' },
  kobu: { name: '鼓舞', desc: '本隊士氣 +20' },
  shingari: { name: '殿軍', desc: '15 秒內不會潰逃' },
  kuruma: { name: '車懸', desc: '旗本與 100 m 內近戰部隊 20 秒攻擊 +25%、衝鋒 +10，被攻擊的敵軍士氣再 −5' },
};
export const PASSIVE: Record<string, string> = {
  hitowa: '人は城：全軍起始士氣 +5', def2: '防禦 +2', cap12: '佔領據點只需 12 秒', nigedanjo: '逃げ弾正：潰走後重整等待 8 秒',
  ammo5: '箭矢 +5', tenkyu: '典厩：60 m 內友軍士氣 +5', atk2: '攻擊 +2', flank20: '側背攻擊加成 +20%',
  bishamon: '毘沙門天：大將光環 90 m、旗本受傷 −20%', charge4: '衝鋒 +4', range20: '射程 +20 m', retreat30: '撤退中受傷 −30%',
};
export const STRATEGY: Record<string, { name: string; desc: string }> = {
  kitsutsuki: { name: '啄木鳥戰法', desc: '全軍 30 秒側背攻擊加成再 +30%' },
  kanpa: { name: '看破', desc: '敵方 20 秒無法施放武將技與軍略' },
};
export const ADV_PASSIVE: Record<string, string> = { heiho: '兵法家：武將技冷卻 −20%', echigo: '越後流軍學：未接戰移動 +10%' };

export type JTarget = 'enemy' | 'pos' | 'point' | 'none';
export const JUTSU: Record<string, { name: string; desc: string; target: JTarget }> = {
  rumor: { name: '流言', desc: '敵軍一隊士氣 −15，30 秒不回復', target: 'enemy' },
  monomi: { name: '物見', desc: '半徑 150 m 內的敵軍洞悉 20 秒', target: 'pos' },
  ansatsu: { name: '暗殺', desc: '刺殺敵方武將（大將除外）。成功率：未接戰 20%、接戰中 10%；失敗則忍者陣亡', target: 'enemy' },
  houka: { name: '放火', desc: '敵方據點失效 60 秒，敵軍勢 −3', target: 'point' },
  kirigakure: { name: '霧隱', desc: '60 m 煙霧 30 秒：煙中我軍只會被察覺、受箭減半', target: 'pos' },
  sahou: { name: '詐報', desc: '讓敵軍以為此處與東側 120 m 有我軍，持續 45 秒', target: 'pos' },
  gisei: { name: '偽旗', desc: '', target: 'enemy' },
  sakuteki: { name: '搜敵', desc: '200 m 內的敵方忍者全部暴露 30 秒', target: 'none' },
  sennyu: { name: '潛入', desc: '指定一隊敵軍，60 秒內持續洞悉其士氣', target: 'enemy' },
};
// 忍者眾特性（clanPassive）：原本的第二種忍術改成自動生效
export const CLAN_PASSIVE: Record<string, { name: string; desc: string; icon: string }> = {
  mitsumono: { name: '情報網', desc: '忍者 150 m 內的敵軍識別速度加倍', icon: 'monomi' },
  nokizaru: { name: '防諜', desc: '敵方忍者進到任一軒猿 100 m 內就會暴露', icon: 'sakuteki' },
  iga: { name: '破壞', desc: '未被發現的忍者待在敵方據點 40 m 內時，該據點對敵軍失效', icon: 'houka' },
  koga: { name: '疑兵', desc: '敵軍識別我方部隊要多花一半時間', icon: 'sahou' },
};
export const CLAN_INFO: Record<string, { name: string; n: number; intel: string; stealth: string; note: string; jutsu: [string, string] }> = {
  mitsumono: { name: '三ツ者', n: 4, intel: '高', stealth: '中', note: '武田家的情報網。開戰即知己方半場所有地形秘密。', jutsu: ['rumor', 'monomi'] },
  iga: { name: '伊賀眾', n: 3, intel: '中', stealth: '中', note: '被發現時 50% 機率脫身。擅長破壞。', jutsu: ['ansatsu', 'houka'] },
  koga: { name: '甲賀眾', n: 5, intel: '高', stealth: '低', note: '人數最多、視野 +30%，但容易被發現，也沒有洞悉手段。', jutsu: ['kirigakure', 'sahou'] },
  nokizaru: { name: '軒猿', n: 4, intel: '中', stealth: '高', note: '上杉家的忍者，擅長反諜。', jutsu: ['sennyu', 'sakuteki'] },
};
