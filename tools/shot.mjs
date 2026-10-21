#!/usr/bin/env node
// 無頭瀏覽器截圖（測試用）。用工作區預裝的 Chromium（/opt/pw-browsers）與 playwright-core。
//   node tools/shot.mjs <網址或檔案路徑> <輸出 png> [寬 預設 844] [高 預設 390] [縮放 預設 1] [腳本.mjs]
// 腳本匯出 async (page) => {}；可用 window.__kessen（advance、setSel、orderAttack、screenOf…）。開戰前要先 page.click('.setup .go')。
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [url, out, w = '844', h = '390', scale = '1', script] = process.argv.slice(2);
if (!url || !out) { console.error('用法：node tools/shot.mjs <網址> <輸出 png> [寬] [高] [縮放] [腳本.mjs]'); process.exit(1); }
const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
const dir = readdirSync(base).find(d => /^chromium-\d+$/.test(d));
const exe = process.env.CHROME_PATH || (dir && resolve(base, dir, 'chrome-linux/chrome'));
if (!exe || !existsSync(exe)) { console.error('找不到 Chromium，請設定 CHROME_PATH'); process.exit(1); }
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale, hasTouch: true });
page.on('pageerror', e => console.log('頁面錯誤：', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('console：', m.text()); });
const target = /^https?:/.test(url) ? url : pathToFileURL(resolve(url.split('#')[0])).href + (url.includes('#') ? '#' + url.split('#')[1] : '');
await page.goto(target, { waitUntil: 'load' });
await page.waitForTimeout(1200);
if (script) { const mod = await import(pathToFileURL(resolve(script)).href); await mod.default(page); }
await page.screenshot({ path: out });
console.log('已存檔', out);
await browser.close();
