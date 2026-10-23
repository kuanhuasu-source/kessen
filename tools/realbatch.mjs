import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs'; import { resolve } from 'node:path'; import { pathToFileURL } from 'node:url';
const base = '/opt/pw-browsers'; const dir = readdirSync(base).find(d => /^chromium-\d+$/.test(d)); const exe = resolve(base, dir, 'chrome-linux/chrome');
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
page.on('pageerror', e => console.log('頁面錯誤：', e.message));
const file = pathToFileURL(resolve(process.argv[2])).href;
const N = Number(process.argv[3] || 12), policy = process.argv[4] || 'rec', extra = process.argv[5] || '';
let wins = 0; const rows = [];
for (let seed = 1; seed <= N; seed++) {
  await page.goto('about:blank'); await page.goto(`${file}#seed=${seed}${extra}`, { waitUntil: 'load' }); await page.waitForTimeout(900);
  await page.evaluate((ls) => { try { localStorage.clear(); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); } catch {} }, JSON.parse(process.env.LS || '{}'));
  if (process.env.LS) { await page.goto('about:blank'); await page.goto(`${file}#seed=${seed}${extra}`, { waitUntil: 'load' }); await page.waitForTimeout(900); }
  await page.click('.setup .go').catch(() => {}); await page.waitForTimeout(300);
  let cards = 0, picks = [];
  for (let i = 0; i < 400; i++) {
    const r = await page.evaluate((policy) => { const K = window.__kessen; K.advance(3); const el = document.querySelector('.advice'); const open = !!(el && !el.hidden); let picked = null; if (open) { const bs = [...el.querySelectorAll('.bt button')]; let b = bs.find(x => x.classList.contains('rec')) || bs[0]; if (policy === 'last') b = bs[bs.length - 1]; if (policy === 'rand') b = bs[Math.floor(Math.random() * bs.length)]; picked = b.textContent.slice(0, 12); b.click(); } return { over: K.S.over, t: K.S.t, army: K.S.army.map(Math.round), open, picked }; }, policy);
    if (r.open) { cards++; picks.push(r.picked); }
    if (r.over) { rows.push({ seed, win: r.over.winner === 0, type: r.over.type, t: Math.round(r.over.t), army: r.army, cards }); if (r.over.winner === 0) wins++; break; }
  }
}
console.log(JSON.stringify(rows));
console.log(`真實遊戲頁 ${N} 局（${policy}${extra}）：武田勝 ${wins}／${N}，平均卡數 ${(rows.reduce((a, r) => a + r.cards, 0) / rows.length).toFixed(1)}`);
await browser.close();
