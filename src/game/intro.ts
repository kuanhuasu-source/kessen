// 歷史導入：第一次開啟時播放的川中島之戰小動畫（浮世繪場景圖慢速推拉 ＋ 日文旁白 ＋ 繁中／日文字幕）。
// 旁白由 Gemini 語音合成在開發時生成（tools/gen-intro-voice.mjs），內嵌成資料網址，遊戲不呼叫任何 API。
import { introImg } from './art.ts';
import { music } from './music.ts';
import script from '../intro/script.json';
const VOICE = import.meta.glob('../intro/s*.mp3', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;
const voice = (id: string) => VOICE[`../intro/${id}.mp3`];
type Scene = { id: string; img: string; ja: string; zh: string };
const SCENES = script as Scene[];
export const INTRO_KEY = 'kessen.introSeen';

const CSS = `
.intro { position: fixed; inset: 0; z-index: 35; background: #0b0a08; pointer-events: auto; overflow: hidden; font-family: inherit; color: #f1e6cf; }
.intro .pic { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 0; transition: opacity 1.1s ease; transform-origin: center; }
.intro .pic.on { opacity: 1; animation: introKb 16s ease-in-out forwards; }
@keyframes introKb { from { transform: scale(1.0) translate(0, 0); } to { transform: scale(1.09) translate(-1.5%, 1%); } }
.intro .shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(10,9,7,0.88) 0%, rgba(10,9,7,0.45) 28%, rgba(10,9,7,0) 55%); }
.intro .sub { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(env(safe-area-inset-bottom, 0px) + 18px); width: min(760px, 92vw); text-align: center; text-shadow: 0 1px 3px #000, 0 0 12px rgba(0,0,0,0.8); }
.intro .ja { font-size: 13px; line-height: 1.5; opacity: 0.85; letter-spacing: 0.02em; }
.intro .zh { font-size: 17px; line-height: 1.55; margin-top: 4px; font-weight: 600; }
@media (min-width: 900px) { .intro .ja { font-size: 15px; } .intro .zh { font-size: 21px; } }
.intro .top { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 10px); left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; padding: 0 14px; }
.intro .ttl { font-size: 13px; letter-spacing: 0.25em; opacity: 0.8; }
.intro .skip { background: rgba(31,26,20,0.75); color: #f1e6cf; border: 1px solid #c9a24c; border-radius: 999px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
.intro .dots { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(env(safe-area-inset-bottom, 0px) + 6px); display: flex; gap: 5px; }
.intro .dots i { width: 6px; height: 6px; border-radius: 50%; background: rgba(241,230,207,0.35); } .intro .dots i.on { background: #c9a24c; }
.intro .gate { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(10,9,7,0.6); cursor: pointer; }
.intro .gate .g { text-align: center; } .intro .gate h2 { margin: 0 0 6px; font-size: 26px; letter-spacing: 0.3em; font-weight: 600; } .intro .gate p { margin: 0; opacity: 0.8; font-size: 14px; }
.intro .gate .b { margin-top: 14px; display: inline-block; padding: 8px 22px; border: 1px solid #c9a24c; border-radius: 999px; font-size: 15px; }
`;

export function showIntro(onDone: () => void) {
  if (!document.getElementById('intro-css')) { const st = document.createElement('style'); st.id = 'intro-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div'); root.className = 'intro';
  root.innerHTML = `<div class="pic a"></div><div class="pic b"></div><div class="shade"></div>
    <div class="top"><span class="ttl">川中島の戦い・永祿四年</span><button type="button" class="skip">略過 ›</button></div>
    <div class="sub"><div class="ja"></div><div class="zh"></div></div>
    <div class="dots">${SCENES.map(() => '<i></i>').join('')}</div>
    <div class="gate"><div class="g"><h2>川中島の戦い</h2><p>第四次川中島之戰・一五六一年九月</p><div class="b">點一下開始</div></div></div>`;
  document.body.appendChild(root);
  const pics = [root.querySelector<HTMLDivElement>('.pic.a')!, root.querySelector<HTMLDivElement>('.pic.b')!];
  const ja = root.querySelector<HTMLDivElement>('.ja')!, zh = root.querySelector<HTMLDivElement>('.zh')!;
  const dots = [...root.querySelectorAll<HTMLElement>('.dots i')];
  let i = -1, cur: HTMLAudioElement | null = null, timer = 0, done = false;
  const finish = () => {
    if (done) return; done = true;
    if (cur) { cur.pause(); cur = null; } clearTimeout(timer);
    try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* 略過 */ }
    music.setDuck(1);
    root.style.transition = 'opacity 0.6s'; root.style.opacity = '0';
    setTimeout(() => { root.remove(); onDone(); }, 600);
  };
  const next = () => {
    if (done) return;
    i++; if (i >= SCENES.length) { finish(); return; }
    const sc = SCENES[i];
    const p = pics[i % 2], q = pics[(i + 1) % 2];
    p.style.backgroundImage = `url(${introImg(sc.img) ?? ''})`; p.classList.remove('on'); void p.offsetWidth; p.classList.add('on'); q.classList.remove('on');
    ja.textContent = sc.ja; zh.textContent = sc.zh;
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    const src = voice(sc.id);
    if (cur) { cur.pause(); }
    let advanced = false; const go = () => { if (advanced) return; advanced = true; timer = window.setTimeout(next, 700); };
    if (src) {
      cur = new Audio(src); cur.volume = 1;
      cur.addEventListener('ended', go); cur.addEventListener('error', () => { timer = window.setTimeout(go, 6000); });
      const pr = cur.play(); if (pr) pr.catch(() => { timer = window.setTimeout(go, 6000); }); // 播不出聲就用固定秒數
    } else timer = window.setTimeout(go, 6000);
  };
  root.querySelector<HTMLButtonElement>('.skip')!.onclick = finish;
  root.querySelector<HTMLDivElement>('.gate')!.onclick = e => { (e.currentTarget as HTMLElement).remove(); music.unlock(); music.setDuck(0.35); next(); };
}
