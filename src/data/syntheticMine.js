/**
 * 程序化生成矿山边坡样例数据
 * 用途：团队无需真实 3D Tiles 即可运行并验证整套分析流水线。
 * 生成内容：
 *   1) dem   —— 精细分析网格（含高程），送入 Worker 做识别
 *   2) meshCells —— 粗分辨率三维网格（用于三维可视化上下文）
 * 模型形态：一条沿 X 方向延伸、沿 Y 方向阶梯下降的露天矿边坡，
 *          其中 narrowBenchIndex 指定的台阶被故意设为窄台面（不合规）。
 */
import { gridSteps, lonLatToLocal } from '../utils/geoUtils.js';

/**
 * 构建阶梯边坡的剖面分段（沿 Y 方向，局部北向坐标）
 */
function buildProfile(cfg) {
  const {
    benchCount, benchHeight, baseElevation,
    narrowBenchIndex, narrowBenchWidth,
    normalWidth = 8, faceRun = 5, sizeMeters = 400
  } = cfg;

  const segments = [];
  let yc = 0;
  for (let k = 0; k < benchCount; k++) {
    const full = k === narrowBenchIndex ? narrowBenchWidth : normalWidth;
    const hw = full / 2;
    const zk = baseElevation + (benchCount - 1 - k) * benchHeight;
    segments.push({ yStart: yc, yEnd: yc + 2 * hw, zStart: zk, zEnd: zk, type: 'platform', width: full, k });
    yc += 2 * hw;
    if (k < benchCount - 1) {
      const zNext = baseElevation + (benchCount - 1 - (k + 1)) * benchHeight;
      segments.push({ yStart: yc, yEnd: yc + faceRun, zStart: zk, zEnd: zNext, type: 'face' });
      yc += faceRun;
    }
  }
  const wallBottom = yc;
  // 边坡下方地形抬升（坡度 ~31°，高于识别阈值，不会被误判为台面）
  segments.push({
    yStart: yc, yEnd: sizeMeters,
    zStart: baseElevation, zEnd: baseElevation + (sizeMeters - yc) * 0.6,
    type: 'rising'
  });
  return { segments, wallBottom, zTop: baseElevation + (benchCount - 1) * benchHeight };
}

/**
 * 剖面高度查询（profileY: 0 在顶部，向下递增）
 */
function heightAt(profileY, profile) {
  const { segments, zTop } = profile;
  if (profileY <= 0) return zTop;
  for (const s of segments) {
    if (profileY >= s.yStart && profileY <= s.yEnd) {
      if (s.type === 'platform') return s.zStart;
      const t = (profileY - s.yStart) / Math.max(1e-9, s.yEnd - s.yStart);
      return s.zStart + (s.zEnd - s.zStart) * t;
    }
  }
  return segments[segments.length - 1].zEnd;
}

/**
 * 构建分析用 DEM
 */
export function buildSyntheticDEM(config) {
  const dm = config.demoMine;
  const res = config.analysis.samplingResolution;
  const centerLon = dm.centerLon;
  const centerLat = dm.centerLat;
  const half = dm.sizeMeters / 2;

  const cols = Math.ceil(dm.sizeMeters / res) + 1;
  const rows = cols;
  const cellSize = res;
  const { lonStep, latStep } = gridSteps(centerLat, res);

  const minLon = centerLon - (cols - 1) * lonStep / 2;
  const minLat = centerLat - (rows - 1) * latStep / 2;

  const profile = buildProfile(dm);
  const heights = new Float32Array(cols * rows);
  const xs = new Float32Array(cols * rows);
  const ys = new Float32Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const lon = minLon + col * lonStep;
      const lat = minLat + row * latStep;
      const { x, y } = lonLatToLocal(lon, lat, centerLon, centerLat);
      const profileY = y + half; // 局部 y(-half..half) -> 剖面(0..size)
      let h = heightAt(profileY, profile);
      // 轻微噪声，模拟真实采集（远小于识别阈值）
      h += (Math.random() - 0.5) * 0.2;
      const idx = row * cols + col;
      heights[idx] = h;
      xs[idx] = x;
      ys[idx] = y;
    }
  }

  return {
    cols, rows, heights, xs, ys, cellSize,
    centerLon, centerLat, lonStep, latStep, minLon, minLat,
    bounds: { minLon, minLat, maxLon: minLon + (cols - 1) * lonStep, maxLat: minLat + (rows - 1) * latStep }
  };
}

/**
 * 高程 -> RGB 颜色（蓝-绿-黄-红）
 */
export function elevationColor(h, minH, maxH) {
  const t = Math.max(0, Math.min(1, (h - minH) / Math.max(1e-6, maxH - minH)));
  // 简单 4 段渐变
  const stops = [
    [0.0, [40, 90, 180]],
    [0.4, [40, 160, 120]],
    [0.7, [220, 200, 60]],
    [1.0, [200, 70, 50]]
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const r = (t - t0) / (t1 - t0);
      return [
        (c0[0] + (c1[0] - c0[0]) * r) / 255,
        (c0[1] + (c1[1] - c0[1]) * r) / 255,
        (c0[2] + (c1[2] - c0[2]) * r) / 255,
        1
      ];
    }
  }
  return [0.5, 0.5, 0.5, 1];
}

/**
 * 构建可视化用粗分辨率网格（每格一个四边形，独立着色）
 * 返回 meshCells: Array<{ corners: [[lon,lat,h]x4], color: [r,g,b,a] }>
 */
export function buildSyntheticMesh(config) {
  const dm = config.demoMine;
  const res = config.analysis.contextMeshRes;
  const half = dm.sizeMeters / 2;
  const cols = Math.ceil(dm.sizeMeters / res);
  const rows = cols;
  const profile = buildProfile(dm);
  const EARTH = 6378137;
  const D2R = Math.PI / 180;

  const lonOf = (xMeters) => dm.centerLon + (xMeters / EARTH) * (180 / D2R) / Math.cos(dm.centerLat * D2R);
  const latOf = (yMeters) => dm.centerLat + (yMeters / EARTH) * (180 / D2R);

  // 先算高程范围用于着色
  let hMin = Infinity, hMax = -Infinity;
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const h = heightAt(-half + row * res + half, profile); // profileY = yLoc + half
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
  }

  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const localCorners = [
        [col * res, row * res],
        [(col + 1) * res, row * res],
        [(col + 1) * res, (row + 1) * res],
        [col * res, (row + 1) * res]
      ];
      const corners = [];
      let ch = 0;
      for (const [cx, cy] of localCorners) {
        const profileY = -half + cy + half; // = cy
        const h = heightAt(cy, profile);
        ch += h;
        corners.push([lonOf(cx - half), latOf(cy - half), h]);
      }
      ch /= 4;
      cells.push({ corners, color: elevationColor(ch, hMin, hMax) });
    }
  }
  return cells;
}
