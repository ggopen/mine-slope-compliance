/**
 * 分析状态（Pinia）
 * 保存分析进度、结果（台面列表/汇总）、当前选中的台面。
 */
import { defineStore } from 'pinia';

export const useAnalysisStore = defineStore('analysis', {
  state: () => ({
    status: 'idle', // idle | loading | done | error
    progressText: '',
    errorMessage: '',
    platforms: [],
    summary: null,
    selectedId: null,
    dataSource: 'none' // none | synthetic | tiles | terrain
  }),
  getters: {
    selectedPlatform: (s) => s.platforms.find((p) => p.id === s.selectedId) || null,
    nonCompliant: (s) => s.platforms.filter((p) => !p.isCompliant)
  },
  actions: {
    setLoading(text) {
      this.status = 'loading';
      this.progressText = text || '分析中...';
    },
    setError(msg) {
      this.status = 'error';
      this.errorMessage = msg;
    },
    setResult({ platforms, summary }, dataSource) {
      this.platforms = platforms;
      this.summary = summary;
      this.status = 'done';
      this.dataSource = dataSource || this.dataSource;
      this.selectedId = platforms.length ? platforms[0].id : null;
    },
    select(id) {
      this.selectedId = id;
    },
    clear() {
      this.status = 'idle';
      this.platforms = [];
      this.summary = null;
      this.selectedId = null;
    }
  }
});
