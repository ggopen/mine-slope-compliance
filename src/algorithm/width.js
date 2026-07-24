/**
 * 台面宽度测量
 * 采用「主成分分析得到台面主轴 -> 沿轴向采样中心线 -> 法线方向射线与边界求交」的方案。
 * 对露天矿常见的长条形台阶稳健，且实现简洁、可测试。（骨架线法可在此处后续替换。）
 */
import { rayPolygonIntersection, dist2D, resamplePolyline } from '../utils/geoUtils.js';

/**
 * 对区域点集做 PCA，返回主轴单位向量 (axisX, axisY)
 */
export function principalAxis(points) {
  let sx = 0, sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  const n = points.length;
  const mx = sx / n;
  const my = sy / n;

  let sxx = 0, syy = 0, sxy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  // 协方差矩阵 [sxx sxy; sxy syy] 的最大特征值对应方向
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const lambda = tr / 2 + disc;

  let axisX, axisY;
  if (Math.abs(sxy) > 1e-9) {
    axisX = lambda - syy;
    axisY = sxy;
  } else {
    axisX = sxx >= syy ? 1 : 0;
    axisY = sxx >= syy ? 0 : 1;
  }
  const len = Math.hypot(axisX, axisY) || 1;
  return { cx: mx, cy: my, axisX: axisX / len, axisY: axisY / len };
}

/**
 * 测量台面宽度
 * @param {Array<{x,y}>} polygon 有序边界多边形
 * @param {Array<{x,y}>} regionPoints 区域点集（用于 PCA 与内部判定）
 * @param {number} interval 采样间距（米）
 * @returns {Array<WidthMeasurement>}
 */
export function measureWidths(polygon, regionPoints, interval = 2.0) {
  if (polygon.length < 3) return [];
  const { cx, cy, axisX, axisY } = principalAxis(regionPoints);

  // 主轴法线（垂直于轴向，水平面内）
  const nx = -axisY;
  const ny = axisX;

  // 沿主轴方向投影，确定采样范围
  let minProj = Infinity, maxProj = -Infinity;
  for (const p of regionPoints) {
    const proj = (p.x - cx) * axisX + (p.y - cy) * axisY;
    if (proj < minProj) minProj = proj;
    if (proj > maxProj) maxProj = proj;
  }

  // 生成主轴方向采样点
  const centerline = [];
  const steps = Math.max(2, Math.ceil((maxProj - minProj) / interval));
  for (let s = 0; s <= steps; s++) {
    const t = minProj + ((maxProj - minProj) * s) / steps;
    const px = cx + axisX * t;
    const py = cy + axisY * t;
    if (pointInPolygon(px, py, polygon)) {
      centerline.push({ x: px, y: py });
    }
  }

  // 等间距重采样中心线
  const sampled = resamplePolyline(centerline, interval);

  const measurements = [];
  for (const pt of sampled) {
    const hitPos = rayPolygonIntersection(pt.x, pt.y, nx, ny, polygon);
    const hitNeg = rayPolygonIntersection(pt.x, pt.y, -nx, -ny, polygon);
    if (hitPos && hitNeg) {
      const width = dist2D(hitNeg.x, hitNeg.y, hitPos.x, hitPos.y);
      measurements.push({
        x: pt.x,
        y: pt.y,
        width,
        leftEdge: { x: hitNeg.x, y: hitNeg.y },
        rightEdge: { x: hitPos.x, y: hitPos.y },
        nx,
        ny
      });
    }
  }

  return measurements;
}

/**
 * 射线法判断点是否在多边形内部
 */
export function pointInPolygon(x, y, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
