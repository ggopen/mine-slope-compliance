/**
 * 配置状态（Pinia）
 * 集中管理合规阈值、分析参数、主题，并持久化到 localStorage。
 */
import { defineStore } from 'pinia';
import { DEFAULT_CONFIG, mergeConfig } from '../config/defaults.js';

const LS_KEY = 'mine-slope-config-v1';
const LS_THEME = 'mine-slope-theme-v1';

function loadConfig() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return mergeConfig(DEFAULT_CONFIG, JSON.parse(raw));
  } catch (e) {
    /* 忽略损坏的配置 */
  }
  return mergeConfig(DEFAULT_CONFIG);
}

export const useConfigStore = defineStore('config', {
  state: () => ({
    config: loadConfig(),
    theme: localStorage.getItem(LS_THEME) || 'dark'
  }),
  getters: {
    compliance: (s) => s.config.compliance,
    analysis: (s) => s.config.analysis
  },
  actions: {
    updateThreshold(key, value) {
      this.config.compliance[key] = Number(value);
      this.persist();
    },
    updateAnalysisParam(key, value) {
      this.config.analysis[key] = Number(value);
      this.persist();
    },
    setVisualization(key, value) {
      this.config.visualization[key] = value;
      this.persist();
    },
    resetDefaults() {
      this.config = mergeConfig(DEFAULT_CONFIG);
      this.persist();
    },
    persist() {
      localStorage.setItem(LS_KEY, JSON.stringify(this.config));
    },
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(LS_THEME, this.theme);
      document.documentElement.setAttribute('data-theme', this.theme);
    },
    applyTheme() {
      document.documentElement.setAttribute('data-theme', this.theme);
    }
  }
});
