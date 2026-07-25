/**
 * 全局默认配置（集中管理，便于团队统一调整）
 * 所有数值单位：距离-米(m)，角度-度(°)
 */
export const DEFAULT_CONFIG = {
  // 模型加载
  model: {
    maximumScreenSpaceError: 16,
    maximumMemoryUsage: 1024,
    dynamicScreenSpaceError: true,
    skipLevelOfDetail: true
  },

  // 分析参数
  analysis: {
    samplingResolution: 2.0,      // 采样间距（米），决定分析精度
    maxSamplingPoints: 500000,    // 最大采样点数，防止内存溢出
    slopeThreshold: 15,           // 坡度阈值（度），小于此值判定为近水平台面
    minPlatformArea: 15,          // 最小台面面积（平方米），过滤噪点
    widthSampleInterval: 2.0,     // 宽度测量间距（米）
    edgeDilation: 1,              // 台面边缘膨胀格数，恢复被坡度梯度裁掉的边界
    contextMeshRes: 80            // 演示用三维网格分辨率（列/行）
  },

  // 合规阈值（用户可配置）
  compliance: {
    safetyPlatformMinWidth: 5.0,
    cleaningPlatformMinWidth: 6.0,
    transportPlatformMinWidth: 8.0,
    generalMinWidth: 5.0
  },

  // 风险等级（宽度 / 阈值 的比值区间）
  riskLevels: {
    high:   { ratio: 0.5, color: '#f5222d', label: '高风险' },
    medium: { ratio: 0.8, color: '#fa8c16', label: '中风险' },
    low:    { ratio: 1.0, color: '#faad14', label: '低风险' },
    none:   { color: '#52c41a', label: '合规' }
  },

  // 可视化
  visualization: {
    compliantColor: '#00d97e',
    nonCompliantColor: '#ff4d4f',
    highlightFillAlpha: 0.4,
    highlightPulse: true,
    highlightPulsePeriod: 2000,
    highlightPulseMinAlpha: 0.2,
    highlightPulseMaxAlpha: 0.6,
    annotationDensity: 'medium' // sparse | medium | dense
  },

  // 演示位置：真实山地坐标（华山附近，具有明显的阶梯状地形）
  // 用户可更换为任意有边坡特征的真实位置
  demoMine: {
    centerLon: 110.0943,    // 华山东侧附近
    centerLat: 34.4742,
    sizeMeters: 500,        // 采样区域边长（米）
    benchCount: 6,          // 台阶数（用于程序化 DEM 回退方案）
    benchHeight: 12,        // 台阶高度（米）
    baseElevation: 1000,    // 底部高程（米）
    normalWidth: 10,        // 正常台面宽度（米）
    narrowBenchIndex: 3,
    narrowBenchWidth: 3.2
  }
};

/**
 * 把字符串阈值配置合并到默认配置上
 */
export function mergeConfig(base, override = {}) {
  return {
    ...base,
    ...override,
    model: { ...base.model, ...(override.model || {}) },
    analysis: { ...base.analysis, ...(override.analysis || {}) },
    compliance: { ...base.compliance, ...(override.compliance || {}) },
    riskLevels: { ...base.riskLevels, ...(override.riskLevels || {}) },
    visualization: { ...base.visualization, ...(override.visualization || {}) }
  };
}
