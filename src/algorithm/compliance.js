/**
 * 合规检查与台面分类
 */

import { DEFAULT_CONFIG } from '../config/defaults.js';

/**
 * 根据台面平均宽度推测类型（辅助参考，用户可手动修正）
 * 长条形台阶面积普遍很大，不宜以面积区分，故按宽度分段。
 */
export function classifyType(platform) {
  const avgW = platform.averageWidth;
  if (avgW < 6.5) return 'safety';
  if (avgW < 8.5) return 'cleaning';
  return 'transport';
}

/**
 * 选择对应阈值
 */
function selectThreshold(type, compliance) {
  switch (type) {
    case 'safety': return compliance.safetyPlatformMinWidth;
    case 'cleaning': return compliance.cleaningPlatformMinWidth;
    case 'transport': return compliance.transportPlatformMinWidth;
    default: return compliance.generalMinWidth;
  }
}

/**
 * 风险等级：根据 宽度/阈值 比值
 */
function riskLevelOf(ratio, riskLevels) {
  if (ratio < riskLevels.high.ratio) return 'high';
  if (ratio < riskLevels.medium.ratio) return 'medium';
  if (ratio < riskLevels.low.ratio) return 'low';
  return 'none';
}

/**
 * 对全部台面执行合规判定
 * @param {Array} platforms 含 widthMeasurements 的台面
 * @param {object} config 完整配置（含 compliance, riskLevels）
 * @returns {Array} 带判定结果的台面
 */
export function checkCompliance(platforms, config) {
  const { compliance, riskLevels } = config;

  for (const platform of platforms) {
    const threshold = selectThreshold(platform.type, compliance);

    let compliantCount = 0;
    for (const m of platform.widthMeasurements) {
      m.isCompliant = m.width >= threshold;
      m.riskLevel = riskLevelOf(m.width / threshold, riskLevels);
      if (m.isCompliant) compliantCount++;
    }

    const total = platform.widthMeasurements.length || 1;
    platform.threshold = threshold;
    platform.isCompliant = compliantCount === total;
    platform.complianceRate = compliantCount / total;

    if (!platform.isCompliant) {
      platform.complianceIssues = generateIssues(platform, threshold);
    } else {
      platform.complianceIssues = [];
    }
  }

  return platforms;
}

function generateIssues(platform, threshold) {
  const issues = [];
  if (platform.minWidth < threshold) {
    issues.push(
      `局部最小宽度 ${platform.minWidth.toFixed(1)}m 低于${typeLabel(platform.type)}最小要求 ${threshold.toFixed(1)}m`
    );
  }
  const highRisk = platform.widthMeasurements.filter((m) => m.riskLevel === 'high');
  if (highRisk.length > 0) {
    issues.push(`存在 ${highRisk.length} 处严重不足区域（宽度 < 阈值的 50%），建议立即整改`);
  }
  return issues;
}

function typeLabel(type) {
  return { safety: '安全平台', cleaning: '清扫平台', transport: '运输平台', unknown: '工作台面' }[type] || '工作台面';
}

/**
 * 汇总统计
 */
export function buildSummary(platforms, config) {
  const total = platforms.length;
  const compliant = platforms.filter((p) => p.isCompliant).length;
  const nonCompliant = total - compliant;
  const riskDist = { high: 0, medium: 0, low: 0, none: 0 };
  for (const p of platforms) {
    const worst = worstRisk(p);
    riskDist[worst]++;
  }
  return {
    totalPlatforms: total,
    compliantCount: compliant,
    nonCompliantCount: nonCompliant,
    complianceRate: total ? compliant / total : 1,
    riskDistribution: riskDist
  };
}

function worstRisk(platform) {
  const order = { high: 3, medium: 2, low: 1, none: 0 };
  let worst = 'none';
  let score = -1;
  for (const m of platform.widthMeasurements) {
    const s = order[m.riskLevel] ?? 0;
    if (s > score) {
      score = s;
      worst = m.riskLevel;
    }
  }
  return worst;
}
