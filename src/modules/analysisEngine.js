/**
 * 分析引擎（主线程封装）
 * 负责创建 Worker、发送分析请求、处理消息回传。
 * 同一时刻只保留最新一次请求（旧的自动作废），避免重复渲染。
 */
import AnalysisWorker from '../workers/analysis.worker.js?worker';

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

      // DEM 通过结构化克隆传入（不转移 buffer，主线程仍需保留用于渲染）
      this.worker.postMessage({ dem, config, reqId });
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
