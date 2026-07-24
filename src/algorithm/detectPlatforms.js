/**
 * 台面候选区域识别 —— 坡度阈值分割 + 8 连通区域标记 + 面积过滤
 * 纯函数，不依赖 Cesium。
 */

import { lonLatToLocal } from '../utils/geoUtils.js';

/**
 * @param {Float32Array} slope 坡度角数组（度）
 * @param {Float32Array} heights 高程网格（米）
 * @param {object} demMeta { cols, rows, cellSize, centerLon, centerLat, lonStep, latStep, minLon, minLat }
 * @param {object} params { slopeThreshold, minPlatformArea }
 * @returns {Array<Region>} 候选台面区域列表
 */
export function detectPlatforms(slope, heights, demMeta, params) {
  const { cols, rows, cellSize, centerLon, centerLat, lonStep, latStep, minLon, minLat } = demMeta;
  const { slopeThreshold = 15, minPlatformArea = 15, edgeDilation = 1 } = params;

  // 1. 二值化：近水平面候选
  const binary = new Uint8Array(cols * rows);
  for (let i = 0; i < slope.length; i++) {
    binary[i] = slope[i] < slopeThreshold ? 1 : 0;
  }

  // 1b. 形态学膨胀：恢复被边缘坡度梯度裁掉的台面边界（边缘 1~2 格常因过渡坡被误判为陡坡）
  let mask = binary;
  if (edgeDilation > 0) {
    mask = new Uint8Array(cols * rows);
    for (let idx = 0; idx < binary.length; idx++) {
      if (binary[idx] !== 1) continue;
      const col = idx % cols;
      const row = (idx - col) / cols;
      for (let dr = -edgeDilation; dr <= edgeDilation; dr++) {
        for (let dc = -edgeDilation; dc <= edgeDilation; dc++) {
          const nc = col + dc;
          const nr = row + dr;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          mask[nr * cols + nc] = 1;
        }
      }
    }
  }

  // 2. 8 连通区域标记（迭代栈 BFS，避免递归爆栈）
  // 注意：标签严格顺序分配、绝不回退复用，防止不同区域共享同一标签号而错误合并。
  const labels = new Int32Array(cols * rows);
  const stack = [];
  let labelCount = 0;
  const minCells = Math.max(1, Math.floor(minPlatformArea / (cellSize * cellSize)) + 0.5);

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 1 && labels[start] === 0) {
      labelCount++;
      stack.length = 0;
      stack.push(start);
      labels[start] = labelCount;

      while (stack.length) {
        const idx = stack.pop();
        const col = idx % cols;
        const row = (idx - col) / cols;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nc = col + dc;
            const nr = row + dr;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            const nIdx = nr * cols + nc;
            if (mask[nIdx] === 1 && labels[nIdx] === 0) {
              labels[nIdx] = labelCount;
              stack.push(nIdx);
            }
          }
        }
      }
    }
  }

  // 3. 收集有效区域
  const regionsMap = new Map();
  for (let idx = 0; idx < labels.length; idx++) {
    const lab = labels[idx];
    if (lab === 0) continue;
    if (!regionsMap.has(lab)) regionsMap.set(lab, []);
    regionsMap.get(lab).push(idx);
  }

  const regions = [];
  let rid = 0;
  for (const [lab, cellIdxs] of regionsMap) {
    if (cellIdxs.length < minCells) continue; // 面积过滤

    const cells = [];
    let sumH = 0;
    let minH = Infinity;
    let maxH = -Infinity;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (const idx of cellIdxs) {
      const col = idx % cols;
      const row = (idx - col) / cols;
      const lon = minLon + col * lonStep;
      const lat = minLat + row * latStep;
      const { x, y } = lonLatToLocal(lon, lat, centerLon, centerLat);
      const h = heights[idx];
      cells.push({ col, row, x, y, h });
      sumH += h;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    regions.push({
      id: `P-${String(++rid).padStart(3, '0')}`,
      cells,
      area: cells.length * cellSize * cellSize,
      meanHeight: sumH / cells.length,
      minHeight: minH,
      maxHeight: maxH,
      bbox: { minX, maxX, minY, maxY }
    });
  }

  return regions;
}
