/**
 * 分析 Web Worker 入口
 * 主线程把 DEM 网格与配置发来，Worker 跑完流水线后回传结果。
 * 这样重型计算（连通区域/Alpha Shape/宽度）不阻塞 UI 线程。
 */
import { analyzePipeline } from '../algorithm/pipeline.js';

self.onmessage = (e) => {
  const { dem, config, reqId } = e.data;
  try {
    const { platforms, summary } = analyzePipeline(dem, config);
    self.postMessage({ type: 'done', reqId, platforms, summary });
  } catch (err) {
    self.postMessage({
      type: 'error',
      reqId,
      message: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack : ''
    });
  }
};
