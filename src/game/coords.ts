// 模擬座標（x 東西 0～1000、y 南北 0～700，武田在南）與 Three.js 世界座標的轉換。
// 世界座標：x = simX − 500；z = 350 − simY（北方為 −z）；y 為高度。
import * as THREE from 'three';
import { height } from '../sim/sim.ts';

export const toWorld = (x: number, y: number, h = height(x, y)) => new THREE.Vector3(x - 500, h, 350 - y);
export const toSim = (v: THREE.Vector3) => ({ x: v.x + 500, y: 350 - v.z });
// 模擬朝向 f（方向 cos f, sin f）→ Three.js 繞 y 軸的旋轉（模型正面朝 +z）
export const yawOf = (f: number) => Math.atan2(Math.cos(f), -Math.sin(f));

// 固定種子的亂數，讓地圖裝飾每次都一樣
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
