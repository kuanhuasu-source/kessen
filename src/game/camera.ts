// 戰場鏡頭（2D）：以地面上的目標點為中心，可平移、縮放；tx/ty/dist 是目標值，vx/vy/vd 是平滑後的值
export class CameraRig {
  tx = 500; ty = 160;          // 目標點（模擬座標）
  dist = 260; yaw = 0;         // 距離（越大看得越廣）；yaw 保留欄位，2D 不旋轉
  minD = 60; maxD = 720;
  private sx = 500; private sy = 160; private sd = 260;

  clamp() {
    this.tx = Math.max(-60, Math.min(1060, this.tx)); this.ty = Math.max(-60, Math.min(760, this.ty));
    this.dist = Math.max(this.minD, Math.min(this.maxD, this.dist));
  }
  // 螢幕方向的平移（公尺）：右、上
  pan(right: number, forward: number) { this.tx += right; this.ty += forward; this.clamp(); }
  rotate(_d: number) { /* 2D 不旋轉 */ }
  zoom(f: number) { this.dist *= f; this.clamp(); }
  get vx() { return this.sx; } get vy() { return this.sy; } get vd() { return this.sd; }
  snap() { this.sx = this.tx; this.sy = this.ty; this.sd = this.dist; }
  apply(dt: number) {
    const k = 1 - Math.exp(-dt * 12);
    this.sx += (this.tx - this.sx) * k; this.sy += (this.ty - this.sy) * k; this.sd += (this.dist - this.sd) * k;
  }
}
