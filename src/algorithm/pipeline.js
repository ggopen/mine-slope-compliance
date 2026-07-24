/**
 * 分析流水线编排器（纯函数，运行于 Web Worker）
 * 输入 DEM 网格 -> 输出带合规判定的台面列表。
 */

import { computeSlope } from './slope.js';
import { detectPlatforms } from './detectPlatforms.js';
import { alphaShapeBoundary } from './boundary.js';
import { measureWidths, principalAxis } from './width.js';
import { classifyType, checkCompliance, buildSummary } from './compliance.js';

/**
 * @param {object} dem { cols, rows, heights(Float32Array), cellSize, centerLon, centerLat, lonStep, latStep, minLon, minLat }
 * @param {object} config 完整配置（含 analysis, compliance, riskLevels）
 * @returns {object} { platforms, summary }
 */
export function analyzePipeline(dem, config) {
  const { cols, rows, heights, cellSize } = dem;
  const { analysis } = config;

  // 1. 坡度
  const slope = computeSlope(heights, cols, rows, cellSize);

  // 2. 台面候选区域
  const regions = detectPlatforms(slope, heights, dem, {
    slopeThreshold: analysis.slopeThreshold,
    minPlatformArea: analysis.minPlatformArea,
    edgeDilation: analysis.edgeDilation
  });

  // 3. 逐区域：边界 + 中心线宽度
  const platforms = [];
  for (const region of regions) {
    // 区域点集用于 Alpha Shape 与 PCA
    const regionPoints = region.cells.map((c) => ({ x: c.x, y: c.y }));

    // Alpha 参数：与采样间距相关，保证边界贴合又不致碎裂
    const alpha = 1 / (analysis.samplingResolution * 2.2);
    const polygon = alphaShapeBoundary(regionPoints, alpha);
    if (polygon.length < 3) continue;

    const widths = measureWidths(polygon, regionPoints, analysis.widthSampleInterval);
    if (widths.length === 0) continue;

    const wvals = widths.map((w) => w.width);
    const minW = Math.min(...wvals);
    const maxW = Math.max(...wvals);
    const avgW = wvals.reduce((a, b) => a + b, 0) / wvals.length;

    const platform = {
      id: region.id,
      type: 'unknown',
      elevation: region.meanHeight,
      area: region.area,
      averageWidth: avgW,
      minWidth: minW,
      maxWidth: maxW,
      bbox: region.bbox,
      boundaryPolygon: polygon,        // 局部坐标 {x,y}
      widthMeasurements: widths,       // 局部坐标 {x,y,width,...}
      _cells: region.cells             // 渲染用（主线程决定是否保留）
    };
    platform.type = classifyType(platform);
    platforms.push(platform);
  }

  // 4. 合规判定
  checkCompliance(platforms, config);

  // 5. 汇总
  const summary = buildSummary(platforms, config);

  return { platforms, summary };
}
