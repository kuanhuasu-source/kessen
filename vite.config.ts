import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 時輸出單一 HTML（用於發布預覽）；平常是一般的 Vite 專案
export default defineConfig({
  plugins: process.env.SINGLE ? [viteSingleFile()] : [],
  server: { host: true }, // 區網內的手機可以直接連
  build: { target: ['es2020', 'safari14', 'chrome90', 'firefox90'], chunkSizeWarningLimit: 1500 }, // 語法降到 Safari 14／iOS 14 也能跑（WebGL2 仍需 iOS 15+）
});
