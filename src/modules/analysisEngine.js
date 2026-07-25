/**
 * 分析引擎（主线程封装）
 * 负责创建 Worker、发送分析请求、处理消息回传。
 * 同一时刻只保留最新一次请求（旧的自动作废），避免重复渲染。
 */
import AnalysisWorker from '../workers/analysis.worker.js?worker';

/**
 * 把 Vue reactive 对象 / 含 TypedArray 的 DEM 深度克隆为可结构化克隆的纯对象。
 * 关键：Pinia store 的 config 是 Proxy，postMessage 无法克隆 Proxy，会抛
 * "could not be cloned" 错误。这里用 JSON 序列化去掉响应式包装，
 * 同时把 Float32Array 转成普通数组（Worker 侧再转回）。
 */
function toTransferable(dem, config) {
  // config 是纯数据，JSON 序列化即可去掉 reactive proxy
  const plainConfig = JSON.parse(JSON.stringify(config));

  // DEM 里的 Float32Array 需要单独处理：JSON 序列化会把 TypedArray 变成普通对象
  // 直接构造纯对象 + 用 slice() 复制 TypedArray（不 transfer，主线程仍需保留）
  const plainDem = {
    cols: dem.cols,
    rows: dem.rows,
    cellSize: dem.cellSize,
    centerLon: dem.centerLon,
    centerLat: dem.centerLat,
    lonStep: dem.lonStep,
    latStep: dem.latStep,
    minLon: dem.minLon,
    minLat: dem.minLat,
    bounds: dem.bounds ? JSON.parse(JSON.stringify(dem.bounds)) : undefined,
    // Float32Array.slice() 返回新的 Float32Array，可被结构化克隆
    heights: dem.heights.slice(),
    xs: dem.xs ? dem.xs.slice() : undefined,
    ys: dem.ys ? dem.ys.slice() : undefined
  };

  return { dem: plainDem, config: plainConfig };
}

export class AnalysisEngine {
  constructor() {
    this.worker = new AnalysisWorker();
    this.reqId = 0;
    this.current = null;
  }

  analyze(dem, config) {
    return new Promise((resolve, reject) => {
      const reqId = ++this.reqId;
      this.current = { resolve, reject, reqId };

      this.worker.onmessage = (e) => {
        const d = e.data;
        if (!this.current || d.reqId !== this.current.reqId) return; // 过期请求忽略
        if (d.type === 'done') {
          resolve({ platforms: d.platforms, summary: d.summary });
        } else {
          reject(new Error(d.message || '分析失败'));
        }
      };
      this.worker.onerror = (err) => {
        if (this.current) this.current.reject(new Error(err.message || 'Worker 错误'));
      };

      // 关键：先去掉 Vue reactive proxy + 复制 TypedArray，否则 postMessage 会抛
      // "Failed to execute 'postMessage' on 'Worker': could not be cloned"
      const { dem: plainDem, config: plainConfig } = toTransferable(dem, config);
      this.worker.postMessage({ dem: plainDem, config: plainConfig, reqId });
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
