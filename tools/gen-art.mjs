#!/usr/bin/env node
// 用 Gemini 生成《決戰》的 2D 美術（依 art/manifest.json）。在你自己的電腦上執行：
//
//   1. 在專案根目錄建立 .env，內容一行：GEMINI_API_KEY=你的金鑰   （.env 已在 .gitignore，不會進版控）
//   2. node tools/gen-art.mjs                 生成全部（已存在的檔案會跳過）
//      node tools/gen-art.mjs --only title,portrait_t_gen   只生成指定的 id
//      node tools/gen-art.mjs --group 武將肖像               只生成某一組
//      node tools/gen-art.mjs --force          已存在的也重新生成
//   3. 把 art/out 資料夾壓縮後傳回對話
//
// 模型可用環境變數 GEMINI_IMAGE_MODEL 指定（預設 gemini-3-pro-image-preview；較便宜可改 gemini-2.5-flash-image）。
// 在雲端工作區（金鑰由代理注入）執行：NODE_USE_ENV_PROXY=1 GEMINI_API_KEY=proxy node tools/gen-art.mjs
// 金鑰只在你的電腦上使用，不會寫進遊戲程式碼。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* 沒有 .env 就用環境變數 */ }
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('找不到 GEMINI_API_KEY：請在專案根目錄的 .env 寫入 GEMINI_API_KEY=...，或設定環境變數。'); process.exit(1); }
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const only = opt('--only')?.split(',');
const group = opt('--group');
const force = args.includes('--force');

const { items } = JSON.parse(readFileSync(join(root, 'art/manifest.json'), 'utf8'));
const todo = items.filter(it => (!only || only.includes(it.id)) && (!group || it.group.includes(group)) && (force || !existsSync(join(root, 'art/out', it.file))));
console.log(`模型 ${MODEL}；待生成 ${todo.length} 張（共 ${items.length}）`);

async function gen(it) {
  // refs：參考圖（art/out 相對路徑），例如家紋，讓旗幟畫對；縮到 512 再附上
  const refParts = [];
  for (const r of it.refs ?? []) {
    const buf = await sharp(join(root, 'art/out', r)).resize(512, 512, { fit: 'inside' }).png().toBuffer();
    refParts.push({ inlineData: { mimeType: 'image/png', data: buf.toString('base64') } });
  }
  const body = {
    contents: [{ role: 'user', parts: [{ text: it.prompt }, ...refParts] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: it.aspect } },
  };
  if (MODEL.includes('pro')) body.generationConfig.imageConfig.imageSize = it.size || '1K';
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) { const w = 5000 * attempt; console.log(`  ${it.id}：${res.status}，${w / 1000} 秒後重試`); await new Promise(r => setTimeout(r, w)); continue; }
    const j = await res.json();
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(j.error ?? j).slice(0, 300)}`);
    const part = j.candidates?.[0]?.content?.parts?.find(p => p.inlineData || p.inline_data);
    const data = part?.inlineData?.data ?? part?.inline_data?.data;
    if (!data) throw new Error(`沒有回傳圖片：${JSON.stringify(j).slice(0, 300)}`);
    const out = join(root, 'art/out', it.file);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(data, 'base64'));
    return out;
  }
  throw new Error('重試次數用盡');
}

let ok = 0, fail = 0;
const queue = [...todo];
async function worker() {
  while (queue.length) {
    const it = queue.shift();
    try { await gen(it); ok++; console.log(`✓ ${it.id}（${it.group}）`); }
    catch (e) { fail++; console.log(`✗ ${it.id}：${e.message}`); }
  }
}
await Promise.all([worker(), worker()]);
console.log(`完成：成功 ${ok}、失敗 ${fail}。圖片在 art/out/，請把整個資料夾壓縮後傳回。`);
