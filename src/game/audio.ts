// 音效：全部用 Web Audio 即時合成（不需音檔，單一 HTML 不會變大）。
// 手機瀏覽器要在使用者手勢後才能出聲：unlock() 在第一次點擊時建立 AudioContext。
// 之後若要換成真實取樣或配音，只要改這個檔案的各個 cue，呼叫端不用動。
const MUTE_KEY = 'kessen.mute';
let ctx: AudioContext | null = null, master: GainNode | null = null;
let muted = false; try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* 略過 */ }
const last: Record<string, number> = {};
const now = () => ctx ? ctx.currentTime : 0;
export function unlock() {
  if (!ctx) {
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 6; master.connect(comp); comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}
export const isMuted = () => muted;
export function setMuted(m: boolean) { muted = m; try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* 略過 */ } if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.02); }
// 同一種音效的最短間隔（秒），避免齊射與接戰時洗耳
const GAP: Record<string, number> = { arrows: 0.25, gun: 0.2, cannon: 0.5, clash: 0.3, charge: 0.6, rout: 0.5, rally: 0.5, cry: 0.6, jutsu: 0.5, drum: 0.1 };
function gate(k: string) { if (!ctx || !master || muted) return false; const t = now(); if (t - (last[k] ?? -9) < (GAP[k] ?? 0.05)) return false; last[k] = t; return true; }

// 基本元件
let noiseBuf: AudioBuffer | null = null;
function noiseSrc() { const c = ctx!; if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }
function env(g: GainNode, t0: number, a: number, peak: number, d: number, sustain = 0, r = 0) {
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  if (sustain > 0) { g.gain.setValueAtTime(peak, t0 + a + sustain); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + sustain + r); }
  else g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}
// 濾波雜訊：hp／lp 截止頻率、音量、起音、衰減
function noise(t0: number, dur: number, lp: number, hp: number, vol: number, a = 0.005, lpEnd?: number) {
  const c = ctx!; const s = noiseSrc(); const f1 = c.createBiquadFilter(); f1.type = 'lowpass'; f1.frequency.setValueAtTime(lp, t0); if (lpEnd) f1.frequency.exponentialRampToValueAtTime(lpEnd, t0 + dur);
  const f2 = c.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = hp; const g = c.createGain(); env(g, t0, a, vol, dur);
  s.connect(f1); f1.connect(f2); f2.connect(g); g.connect(master!); s.start(t0); s.stop(t0 + dur + 0.05);
}
// 單音：波形、起始與結束頻率、時長、音量
function tone(t0: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, a = 0.01, lp = 4000) {
  const c = ctx!; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; const g = c.createGain(); env(g, t0, a, vol, dur);
  o.connect(f); f.connect(g); g.connect(master!); o.start(t0); o.stop(t0 + dur + 0.05);
}
function drumHit(t0: number, vol = 0.5, f = 90) { tone(t0, 'sine', f * 1.6, f * 0.55, 0.35, vol, 0.004, 1200); noise(t0, 0.06, 1800, 200, vol * 0.5, 0.002); }
// 法螺貝：帶顫音的鋸齒波，低通，慢起音
function horagai(t0: number, dur = 1.4, f = 196, vol = 0.22) {
  const c = ctx!; const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.94, t0); o.frequency.exponentialRampToValueAtTime(f, t0 + 0.25);
  const v = c.createOscillator(); v.frequency.value = 5.5; const vg = c.createGain(); vg.gain.value = f * 0.012; v.connect(vg); vg.connect(o.frequency);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t0); lp.frequency.linearRampToValueAtTime(1400, t0 + 0.4); lp.frequency.linearRampToValueAtTime(500, t0 + dur);
  const g = c.createGain(); env(g, t0, 0.18, vol, 0, dur - 0.5, 0.32);
  o.connect(lp); lp.connect(g); g.connect(master!); o.start(t0); v.start(t0); o.stop(t0 + dur + 0.1); v.stop(t0 + dur + 0.1);
}

export const sfx = {
  ui() { if (!gate('ui')) return; const t = now(); noise(t, 0.03, 6000, 1500, 0.12, 0.002); },
  drum(n = 1, vol = 0.5) { if (!gate('drum')) return; const t = now(); for (let i = 0; i < n; i++) drumHit(t + i * 0.22, vol); },
  battleStart() { if (!gate('start')) return; const t = now(); horagai(t, 1.6); drumHit(t + 0.9, 0.6); drumHit(t + 1.25, 0.5); drumHit(t + 1.5, 0.7, 70); },
  arrows(n = 1) { if (!gate('arrows')) return; const t = now(); const k = Math.min(3, Math.max(1, Math.round(n / 8))); for (let i = 0; i < k; i++) noise(t + i * 0.06, 0.35, 5000, 900, 0.16, 0.01, 1200); },
  gun() { if (!gate('gun')) return; const t = now(); noise(t, 0.09, 4000, 300, 0.5, 0.001, 600); tone(t, 'sine', 160, 50, 0.25, 0.35, 0.002, 800); },
  cannon() { if (!gate('cannon')) return; const t = now(); noise(t, 0.7, 500, 40, 0.7, 0.003, 120); tone(t, 'sine', 70, 35, 0.9, 0.5, 0.003, 300); noise(t + 0.02, 0.15, 3000, 200, 0.25, 0.001); },
  clash(intensity = 0.5) { if (!gate('clash')) return; const t = now(); const n = 2 + Math.round(intensity * 3); for (let i = 0; i < n; i++) { const d = i * (0.05 + Math.random() * 0.06); noise(t + d, 0.05 + Math.random() * 0.05, 7000, 2500, 0.08 + intensity * 0.12, 0.001); if (Math.random() < 0.5) tone(t + d, 'triangle', 2400 + Math.random() * 1500, 1800, 0.08, 0.05, 0.001, 6000); } },
  charge() { if (!gate('charge')) return; const t = now(); for (let i = 0; i < 7; i++) { const d = i * 0.11 + (i % 2) * 0.03; tone(t + d, 'sine', 110, 55, 0.12, 0.28, 0.003, 500); noise(t + d, 0.04, 1200, 150, 0.12, 0.002); } horagai(t + 0.1, 0.9, 262, 0.14); },
  rout() { if (!gate('rout')) return; const t = now(); tone(t, 'sawtooth', 420, 190, 0.7, 0.1, 0.03, 1500); tone(t + 0.08, 'sawtooth', 500, 230, 0.6, 0.07, 0.03, 1500); noise(t, 0.5, 2500, 400, 0.08, 0.05); },
  rally() { if (!gate('rally')) return; const t = now(); drumHit(t, 0.4, 110); drumHit(t + 0.16, 0.45, 110); },
  cry() { if (!gate('cry')) return; const t = now(); for (let i = 0; i < 3; i++) { noise(t + i * 0.05, 0.4, 1800, 250, 0.14, 0.03, 900); tone(t + i * 0.05, 'sawtooth', 190 + i * 30, 160 + i * 25, 0.4, 0.05, 0.03, 900); } },
  cmd() { if (!gate('cmd')) return; const t = now(); drumHit(t, 0.55, 80); horagai(t + 0.05, 0.8, 294, 0.16); },
  advice() { if (!gate('advice')) return; const t = now(); tone(t, 'sine', 880, 870, 0.5, 0.12, 0.003, 6000); tone(t + 0.01, 'sine', 1320, 1310, 0.35, 0.05, 0.003, 6000); },
  jutsu() { if (!gate('jutsu')) return; const t = now(); noise(t, 0.5, 1500, 500, 0.1, 0.08, 400); tone(t, 'sine', 660, 640, 0.6, 0.08, 0.1, 3000); },
  death() { if (!gate('death')) return; const t = now(); tone(t, 'sine', 330, 320, 1.6, 0.18, 0.005, 5000); tone(t, 'sine', 495, 490, 1.2, 0.08, 0.005, 5000); noise(t, 0.08, 5000, 1000, 0.15, 0.001); }, // 鑼
  victory() { if (!gate('end')) return; const t = now(); horagai(t, 1.2, 196, 0.2); horagai(t + 0.5, 1.4, 262, 0.2); horagai(t + 1.0, 1.8, 330, 0.22); for (let i = 0; i < 4; i++) drumHit(t + 0.3 + i * 0.3, 0.5, 80 + i * 10); },
  defeat() { if (!gate('end')) return; const t = now(); for (let i = 0; i < 6; i++) drumHit(t + i * 0.18, 0.35 + i * 0.05, 60); tone(t + 0.6, 'sawtooth', 220, 110, 1.6, 0.12, 0.2, 800); },
};
