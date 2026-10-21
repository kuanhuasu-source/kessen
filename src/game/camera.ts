// RTS 鏡頭：以地面上的目標點為中心，可平移、旋轉、縮放；越近越貼地
import * as THREE from 'three';
import { height } from '../sim/sim.ts';

export class CameraRig {
  cam: THREE.PerspectiveCamera;
  tx = 500; ty = 160;          // 目標點（模擬座標）
  dist = 260; yaw = 0;         // 距離；yaw = 0 表示從南往北看
  minD = 22; maxD = 720;
  private sx = 500; private sy = 160; private sd = 260; private syaw = 0; // 平滑後的值

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(42, aspect, 1, 4000);
    this.apply(1);
  }
  pitch(d: number) { // 近處 24°、遠處 62°
    const k = (Math.log(d) - Math.log(this.minD)) / (Math.log(this.maxD) - Math.log(this.minD));
    return THREE.MathUtils.degToRad(24 + 38 * Math.max(0, Math.min(1, k)));
  }
  clamp() {
    this.tx = Math.max(-60, Math.min(1060, this.tx)); this.ty = Math.max(-60, Math.min(760, this.ty));
    this.dist = Math.max(this.minD, Math.min(this.maxD, this.dist));
  }
  // 依目前視角，把螢幕方向的平移（公尺）換算成模擬座標
  pan(right: number, forward: number) {
    // 鏡頭往前方向（模擬座標）= (sin yaw, cos yaw)，右方 = (cos yaw, −sin yaw)
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.tx += right * c + forward * s;
    this.ty += -right * s + forward * c;
    this.clamp();
  }
  rotate(d: number) { this.yaw += d; }
  zoom(f: number) { this.dist *= f; this.clamp(); }
  snap() { this.sx = this.tx; this.sy = this.ty; this.sd = this.dist; this.syaw = this.yaw; this.apply(1); }
  apply(dt: number) {
    const k = 1 - Math.exp(-dt * 12);
    this.sx += (this.tx - this.sx) * k; this.sy += (this.ty - this.sy) * k;
    this.sd += (this.dist - this.sd) * k; this.syaw += (this.yaw - this.syaw) * k;
    const p = this.pitch(this.sd);
    const gx = this.sx - 500, gz = 350 - this.sy, gh = height(this.sx, this.sy);
    // yaw = 0：鏡頭在目標南方（+z）往北看
    const hx = -Math.sin(this.syaw), hz = Math.cos(this.syaw);
    this.cam.position.set(gx + hx * this.sd * Math.cos(p), gh + this.sd * Math.sin(p), gz + hz * this.sd * Math.cos(p));
    this.cam.lookAt(gx, gh, gz);
  }
}
