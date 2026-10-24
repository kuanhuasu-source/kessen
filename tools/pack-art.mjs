#!/usr/bin/env node
// 把 Gemini 生成的原圖（art/out，1K～2K 的 PNG／JPEG）縮成遊戲用的 WebP（art/web）。
//   node tools/pack-art.mjs            全部重做（很快，幾秒）
// 尺寸：肖像 256、插畫 1280 寬、圖示 96、家紋 128（去背成白色圖樣＋透明）、旗指物 128×256、紋理 512、介面框 640。
// 單一 HTML 只會內嵌 portraits／illus／icons／kamon 四個資料夾（見 src/game/art.ts）；其餘先備著。
import sharp from 'sharp';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { items } = JSON.parse(readFileSync(join(root, 'art/manifest.json'), 'utf8'));
const src = (f) => join(root, 'art/out', f);
const dst = (f) => { const p = join(root, 'art/web', f); mkdirSync(dirname(p), { recursive: true }); return p; };

// 去掉生成圖四周的紙邊（裱框、白邊）：沿每一邊往內找第一條與邊緣顏色明顯不同的線，各邊分別裁，最多裁 maxFrac
async function trimMargin(img, maxFrac = 0.2) {
  const { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const lum = (x, y) => { const i = (y * width + x) * channels; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; };
  // 取一條線上 5 個取樣點的平均亮度，避免被單一圖樣誤判
  const line = (get) => { let s = 0; for (let k = 1; k <= 5; k++) s += get(k / 6); return s / 5; };
  const probe = (get, limit) => {
    const ref = line(f => get(0, f));
    for (let i = 1; i < limit; i++) { if (Math.abs(line(f => get(i, f)) - ref) > 18) return i; }
    return 0;
  };
  const lim = Math.floor(Math.min(width, height) * maxFrac);
  const l = probe((i, f) => lum(i, Math.floor(height * f)), lim), r = probe((i, f) => lum(width - 1 - i, Math.floor(height * f)), lim);
  const t = probe((i, f) => lum(Math.floor(width * f), i), lim), b = probe((i, f) => lum(Math.floor(width * f), height - 1 - i), lim);
  const pad = 3; // 再多裁幾個像素，去掉框線的殘影
  const L = l > 2 ? l + pad : 0, R = r > 2 ? r + pad : 0, T = t > 2 ? t + pad : 0, B = b > 2 ? b + pad : 0;
  if (!L && !R && !T && !B) return img;
  return img.extract({ left: L, top: T, width: width - L - R, height: height - T - B });
}

const jobs = {
  portraits: async (it) => sharp(await (await trimMargin(sharp(src(it.file)))).toBuffer()).resize(256, 256, { fit: 'cover', position: 'attention' }).webp({ quality: 78 }).toFile(dst(it.file.replace(/\.png$/, '.webp'))),
  illus: async (it) => sharp(await (await trimMargin(sharp(src(it.file)), 0.08)).toBuffer()).resize(1280, 720, { fit: 'cover' }).webp({ quality: 70 }).toFile(dst(`illus/${it.id}.webp`)),
  icons: async (it) => sharp(await (await trimMargin(sharp(src(it.file)))).toBuffer()).resize(96, 96, { fit: 'cover' }).webp({ quality: 80 }).toFile(dst(it.file.replace(/\.png$/, '.webp'))),
  // 家紋：黑圖樣＋米色底 → 白色圖樣＋透明底，裁到圖樣邊緣再留 8% 邊
  kamon: async (it) => {
    const { data, info } = await sharp(src(it.file)).greyscale().negate().normalise().raw().toBuffer({ resolveWithObject: true });
    // 找圖樣（亮度 > 90）的外框
    let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels] > 90) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, s = Math.ceil(Math.max(w, h) * 1.16);
    const left = Math.max(0, Math.round(x0 + w / 2 - s / 2)), top = Math.max(0, Math.round(y0 + h / 2 - s / 2));
    const ww = Math.min(s, info.width - left), hh = Math.min(s, info.height - top);
    const alpha = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .extract({ left, top, width: ww, height: hh }).resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0 } }).extractChannel(0).raw().toBuffer();
    return sharp({ create: { width: 128, height: 128, channels: 3, background: '#f6efe0' } }).joinChannel(alpha, { raw: { width: 128, height: 128, channels: 1 } })
      .webp({ quality: 90 }).toFile(dst(it.file.replace(/\.png$/, '.webp')));
  },
  banners: (it) => sharp(src(it.file)).resize(128, 256, { fit: 'cover' }).webp({ quality: 78 }).toFile(dst(it.file.replace(/\.png$/, '.webp'))),
  intro: async (it) => sharp(await (await trimMargin(sharp(src(it.file)), 0.08)).toBuffer()).resize(1152, 648, { fit: 'cover' }).webp({ quality: 62 }).toFile(dst(it.file.replace(/\.png$/, '.webp'))), // 導入插畫：全螢幕但要省空間
  textures: (it) => sharp(src(it.file)).resize(512, 512, { fit: 'cover' }).webp({ quality: 70 }).toFile(dst(it.file.replace(/\.png$/, '.webp'))),
  ui: (it) => sharp(src(it.file)).resize(640, null).webp({ quality: 75 }).toFile(dst(it.file.replace(/\.png$/, '.webp'))),
};
const kindOf = (it) => it.id === 'title' || it.id === 'loading' ? 'illus' : it.file.split('/')[0];

let ok = 0, miss = 0, bytes = 0;
for (const it of items) {
  if (!existsSync(src(it.file))) { miss++; continue; }
  const kind = kindOf(it);
  try { const r = await jobs[kind](it); ok++; bytes += statSync(kind === 'illus' ? dst(`illus/${it.id}.webp`) : dst(it.file.replace(/\.png$/, '.webp'))).size; }
  catch (e) { console.log(`✗ ${it.id}：${e.message}`); }
}
console.log(`完成 ${ok} 張（缺原圖 ${miss}），art/web 共 ${(bytes / 1024).toFixed(0)} KB`);
