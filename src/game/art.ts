// 2D 美術：Gemini 生成的原圖（art/out，不進版控）經 tools/pack-art.mjs 縮成 WebP（art/web，進版控），
// 建置時由 Vite 內嵌進單一 HTML。沒有圖檔時每個函式回傳 undefined，介面退回漢字與色塊。
const files = import.meta.glob('../../art/web/{portraits,illus,icons,kamon,textures}/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const map = new Map<string, string>();
for (const [p, url] of Object.entries(files)) {
  const m = p.match(/art\/web\/([a-z]+)\/([\w-]+)\.webp$/);
  if (m) map.set(`${m[1]}/${m[2]}`, url);
}
export const art = (key: string): string | undefined => map.get(key);

// 武將名 → 肖像檔名（art/manifest.json）
const PORTRAIT: Record<string, string> = {
  '武田信玄': 't_gen', '山本勘助': 't_adv', '馬場信春': 't_baba', '內藤昌豐': 't_naito', '高坂昌信': 't_kosaka', '小山田信茂': 't_oyamada',
  '武田信繁': 't_nobushige', '飯富虎昌': 't_obu', '山縣昌景': 't_yamagata',
  '上杉謙信': 'u_gen', '宇佐美定滿': 'u_adv', '直江景綱': 'u_naoe', '中條藤資': 'u_nakajo', '色部勝長': 'u_irobe', '安田長秀': 'u_yasuda',
  '柿崎景家': 'u_kakizaki', '甘粕景持': 'u_amakasu', '齋藤朝信': 'u_saito',
};
export const portraitOf = (cmd: string | undefined) => cmd && PORTRAIT[cmd] ? art(`portraits/${PORTRAIT[cmd]}`) : undefined;
export const ninjaPortrait = (clan: string) => art(`portraits/nin_${clan}`);
export const skillIcon = (id: string) => art(`icons/skill_${id}`); // 武將技、軍略（kitsutsuki、kanpa）、鬨聲（cry）
export const jutsuIcon = (id: string) => art(`icons/jutsu_${id}`);
export const kamon = (side: number) => art(`kamon/${side === 0 ? 'takeda' : 'uesugi'}`);
export const illus = (id: 'title' | 'loading') => art(`illus/${id}`);
export const texture = (id: 'grass' | 'forest' | 'paddy' | 'dirt') => art(`textures/${id}`);

// 介面小圖的 <img>；沒有圖就回傳空字串
export const img = (url: string | undefined, cls: string, alt = '') => url ? `<img class="${cls}" src="${url}" alt="${alt}" draggable="false">` : '';
// 漢字方塊（旗牌與資訊面板）：有肖像時肖像當底、漢字縮成右下角標
export const kanBox = (cls: string, kanji: string, color: string, pic?: string) =>
  `<span class="${cls}${pic ? ' pic' : ''}" style="--sc:${color};background-color:${color}${pic ? `;background-image:url(${pic})` : ''}"><i class="kj">${kanji}</i></span>`;

// 旗號（canvas）上的家紋：圖片載入完成後 artVersion +1，旗號會重畫
export let artVersion = 0;
export const kamonImg: (HTMLImageElement | null)[] = [null, null];
for (const s of [0, 1]) {
  const u = kamon(s); if (!u) continue;
  const im = new Image(); im.onload = () => { kamonImg[s] = im; artVersion++; }; im.src = u;
}
