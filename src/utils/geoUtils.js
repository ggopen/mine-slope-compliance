/**
 * 纯地理/几何工具函数（不依赖 Cesium，可在 Worker / 单元测试中直接使用）
 * 设计原则：算法层只处理数值网格与平面坐标（米），经纬度 <-> 局部米坐标的换算在此完成。
 */

const EARTH_RADIUS = 6378137; // WGS84 长半轴（米）
const DEG2RAD = Math.PI / 180;

/**
 * 经纬度 -> 以 center 为原点的局部平面坐标（米，东向 x / 北向 y）
 * 采用等距圆柱近似（小范围矿山内误差可忽略）
 */
export function lonLatToLocal(lon, lat, centerLon, centerLat) {
  const x = (lon - centerLon) * DEG2RAD * EARTH_RADIUS * Math.cos(centerLat * DEG2RAD);
  const y = (lat - centerLat) * DEG2RAD * EARTH_RADIUS;
  return { x, y };
}

/**
 * 局部平面坐标（米） -> 经纬度
 */
export function localToLonLat(x, y, centerLon, centerLat) {
  const lon = centerLon + (x / (EARTH_RADIUS * Math.cos(centerLat * DEG2RAD))) / DEG2RAD;
  const lat = centerLat + (y / EARTH_RADIUS) / DEG2RAD;
  return { lon, lat };
}

/**
 * 生成规则采样网格的经纬度步长
 * @param {number} centerLat 中心纬度（度）
 * @param {number} resolution 采样间距（米）
 */
export function gridSteps(centerLat, resolution) {
  const lonStep = (resolution / (EARTH_RADIUS * Math.cos(centerLat * DEG2RAD))) / DEG2RAD;
  const latStep = (resolution / EARTH_RADIUS) / DEG2RAD;
  return { lonStep, latStep };
}

/**
 * 射线（point + dir）与多边形（有序顶点，平面坐标 {x,y}）求交，
 * 返回沿 dir 方向的第一个交点。用于台面宽度测量。
 * dir 必须为单位向量。
 */
export function rayPolygonIntersection(px, py, dx, dy, polygon) {
  let best = null;
  let bestT = Infinity;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-12) continue; // 平行
    const t = ((a.x - px) * ey - (a.y - py) * ex) / denom; // 沿射线参数
    const u = ((a.x - px) * dy - (a.y - py) * dx) / denom; // 沿边参数
    if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9) {
      if (t < bestT) {
        bestT = t;
        best = { x: px + dx * t, y: py + dy * t, t };
      }
    }
  }
  return best;
}

/**
 * 点到点距离（平面，米）
 */
export function dist2D(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * 线性插值重采样折线，使其相邻点间距 ~ interval
 * points: [{x,y}]
 */
export function resamplePolyline(points, interval) {
  if (points.length < 2) return points.slice();
  const out = [points[0]];
  let prev = points[0];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    let cur = points[i];
    let segLen = dist2D(prev.x, prev.y, cur.x, cur.y);
    while (acc + segLen >= interval && segLen > 1e-9) {
      const remain = interval - acc;
      const ratio = remain / segLen;
      const nx = prev.x + (cur.x - prev.x) * ratio;
      const ny = prev.y + (cur.y - prev.y) * ratio;
      out.push({ x: nx, y: ny });
      prev = { x: nx, y: ny };
      segLen = dist2D(prev.x, prev.y, cur.x, cur.y);
      acc = 0;
    }
    acc += segLen;
    prev = cur;
  }
  // 确保终点包含
  const last = points[points.length - 1];
  const lastOut = out[out.length - 1];
  if (dist2D(lastOut.x, lastOut.y, last.x, last.y) > 1e-6) out.push(last);
  return out;
}

/**
 * Douglas-Peucker 折线简化
 */
export function douglasPeucker(points, epsilon) {
  if (points.length < 3) return points.slice();
  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function perpendicularDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}
