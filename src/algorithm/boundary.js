/**
 * 台面边界提取 —— Alpha Shape 算法
 * 利用 d3-delaunay 计算 Delaunay 三角剖分，按外接圆半径过滤三角形，
 * 提取只属于一个三角形的边构成凹边界。失败时回退到凸包。
 */
import { Delaunay } from 'd3-delaunay';

/**
 * @param {Array<{x:number,y:number}>} points 区域点集（局部平面坐标，米）
 * @param {number} alpha Alpha 参数，越大边界越贴合（建议 1/pointSpacing）
 * @returns {Array<{x:number,y:number}>} 有序边界多边形
 */
export function alphaShapeBoundary(points, alpha) {
  if (points.length < 3) return points.slice();

  const delaunay = Delaunay.from(points, (p) => p.x, (p) => p.y);
  const triangles = delaunay.triangles; // Int32Array, 每 3 个为一个三角形
  const maxRadius = 1 / Math.max(alpha, 1e-6);

  const edgeCount = new Map(); // key -> {count, a, b}

  for (let t = 0; t < triangles.length; t += 3) {
    const ia = triangles[t];
    const ib = triangles[t + 1];
    const ic = triangles[t + 2];
    const r = circumradius(points[ia], points[ib], points[ic]);
    if (r <= maxRadius) {
      addEdge(edgeCount, ia, ib);
      addEdge(edgeCount, ib, ic);
      addEdge(edgeCount, ic, ia);
    }
  }

  // 收集边界边（只出现一次）
  const boundaryEdges = [];
  for (const [key, e] of edgeCount) {
    if (e.count === 1) boundaryEdges.push([e.a, e.b]);
  }

  if (boundaryEdges.length < 3) {
    // Alpha Shape 退化，回退凸包
    return convexHullFallback(delaunay);
  }

  const polygon = orderEdgesToPolygon(boundaryEdges, points);
  if (polygon.length < 3) return convexHullFallback(delaunay);
  return polygon;
}

function addEdge(map, a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const key = lo + '_' + hi;
  if (!map.has(key)) map.set(key, { count: 0, a: lo, b: hi });
  map.get(key).count++;
}

function circumradius(a, b, c) {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y, cx = c.x, cy = c.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return Infinity;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  return Math.hypot(ax - ux, ay - uy);
}

/**
 * 将边界边贪心连接为有序多边形（处理多连通情形，取最长环）
 */
function orderEdgesToPolygon(edges, points) {
  const adj = new Map();
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }

  const used = new Set();
  let bestRing = [];

  for (const start of adj.keys()) {
    if (used.has(start)) continue;
    const ring = [start];
    let prev = start;
    let cur = adj.get(start)[0];
    used.add(start);
    let guard = 0;
    while (cur !== undefined && cur !== start && guard < edges.length + 5) {
      ring.push(cur);
      used.add(cur);
      const nexts = adj.get(cur) || [];
      let nxt = nexts.find((n) => !used.has(n)) ?? nexts[0];
      prev = cur;
      cur = nxt;
      guard++;
    }
    if (ring.length > bestRing.length) bestRing = ring;
  }

  return bestRing.map((i) => ({ x: points[i].x, y: points[i].y }));
}

function convexHullFallback(delaunay) {
  const hull = delaunay.hullPolygon();
  if (hull && hull.length) return hull.map((p) => ({ x: p[0], y: p[1] }));
  return [];
}
