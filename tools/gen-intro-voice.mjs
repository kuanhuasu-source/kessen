#!/usr/bin/env node
// 用 Gemini 語音合成重新生成歷史導入的日文旁白（src/intro/script.json → src/intro/s*.mp3）。
//   在雲端工作區：node tools/gen-intro-voice.mjs            （金鑰由代理注入）
//   在自己電腦：  GEMINI_API_KEY=... node tools/gen-intro-voice.mjs
// 需要 ffmpeg。聲音預設 Charon（可用 VOICE=Kore 等改）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = process.env.GEMINI_API_KEY || 'proxy';
const VOICE = process.env.VOICE || 'Charon';
const scenes = JSON.parse(readFileSync(join(root, 'src/intro/script.json'), 'utf8'));
mkdirSync(join(root, 'src/intro'), { recursive: true });
for (const sc of scenes) {
  const body = { contents: [{ parts: [{ text: '落ち着いた語り部の口調で、自然な速さで読み上げてください：\n' + sc.ja }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } };
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body) });
  const j = await res.json();
  const data = j.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) { console.log(`✗ ${sc.id}：${JSON.stringify(j).slice(0, 200)}`); continue; }
  const pcm = join(root, 'src/intro', `${sc.id}.pcm`); writeFileSync(pcm, Buffer.from(data, 'base64'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcm, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.4', '-codec:a', 'libmp3lame', '-b:a', '48k', join(root, 'src/intro', `${sc.id}.mp3`)]);
  execFileSync('rm', [pcm]);
  console.log(`✓ ${sc.id}`);
}
