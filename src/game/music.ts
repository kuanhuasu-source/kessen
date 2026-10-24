// 配樂層：三段曲子（軍議 council、交戰 battle、別働隊抵達到結算 climax），外部 MP3 檔放在頁面旁的 music/ 資料夾
// （開發：public/music/；Pages：site/music/；artifact 單檔沒有 music/ 就靜音）。淡入淡出、手機要在手勢後才能播、跟音效鍵共用靜音。
export type Track = 'council' | 'battle' | 'climax';
const FILES: Record<Track, string> = { council: 'council.mp3', battle: 'battle.mp3', climax: 'climax.mp3' };
const VOL = 0.45, FADE = 1500;
const base = (() => { try { return new URL('music/', location.href).href; } catch { return 'music/'; } })();
const els: Partial<Record<Track, HTMLAudioElement>> = {};
const missing = new Set<Track>();
let cur: Track | null = null, muted = false, duck = 1, wantPlay = false, fades = new Map<HTMLAudioElement, number>();

function el(t: Track): HTMLAudioElement | null {
  if (missing.has(t)) return null;
  let a = els[t];
  if (!a) {
    a = new Audio(base + FILES[t]); a.loop = true; a.preload = 'auto'; a.volume = 0;
    a.addEventListener('error', () => { missing.add(t); if (cur === t) cur = null; });
    els[t] = a;
  }
  return a;
}
function fadeTo(a: HTMLAudioElement, v: number, ms: number, then?: () => void) {
  const id = fades.get(a); if (id) cancelAnimationFrame(id);
  const v0 = a.volume, t0 = performance.now();
  const tick = () => { const k = Math.min(1, (performance.now() - t0) / ms); a.volume = v0 + (v - v0) * k; if (k < 1) fades.set(a, requestAnimationFrame(tick)); else { fades.delete(a); then?.(); } };
  tick();
}
const target = () => (muted ? 0 : VOL * duck);
function tryPlay(a: HTMLAudioElement) {
  const p = a.play(); if (p) p.catch(() => { wantPlay = true; }); // 還沒有手勢：等下一次點擊再播
}
export const music = {
  play(t: Track) {
    if (cur === t) return;
    const prev = cur ? els[cur] : null; cur = t;
    if (prev) fadeTo(prev, 0, FADE, () => { prev.pause(); });
    const a = el(t); if (!a) return;
    a.currentTime = 0; a.volume = 0; tryPlay(a); fadeTo(a, target(), FADE);
  },
  stop() { const a = cur ? els[cur] : null; cur = null; if (a) fadeTo(a, 0, FADE, () => a.pause()); },
  setMuted(m: boolean) { muted = m; const a = cur ? els[cur] : null; if (a) fadeTo(a, target(), 300); },
  setDuck(d: number) { duck = d; const a = cur ? els[cur] : null; if (a) fadeTo(a, target(), 600); }, // 結算畫面把音樂壓低
  unlock() { if (!wantPlay) return; wantPlay = false; const a = cur ? els[cur] : null; if (a && a.paused) { tryPlay(a); fadeTo(a, target(), FADE); } },
  current: () => cur,
  debug: () => Object.entries(els).map(([k, a]) => `${k} paused=${a.paused} vol=${a.volume.toFixed(2)} t=${a.currentTime.toFixed(1)} err=${a.error ? a.error.code : 0}`), // 測試用
};
