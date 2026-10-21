// 建置單一 HTML，並去掉 doctype/html/head/body 外殼（發布時會自動加上）
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
execSync('npx vite build', { stdio: 'inherit', env: { ...process.env, SINGLE: '1' } });
let h = readFileSync('dist/index.html', 'utf8');
h = h.replace(/<!doctype html>/i, '').replace(/<\/?html[^>]*>/gi, '').replace(/<\/?head>/gi, '').replace(/<\/?body>/gi, '');
h = h.replace(/<meta charset="utf-8" \/>/i, '').replace(/<meta name="viewport"[^>]*>/i, '');
h = '<title>決戰 M1</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + h.replace(/<title>[^<]*<\/title>/, '');
writeFileSync('dist/kessen-m1.html', h);
console.log('dist/kessen-m1.html', (h.length / 1024).toFixed(0), 'KB');
