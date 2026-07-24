<template>
  <div class="right-panel">
    <el-tabs v-model="tab" class="tabs">
      <el-tab-pane label="统计概览" name="stats">
        <div v-if="!summary" class="empty muted">尚未进行分析</div>
        <div v-else class="stats">
          <div class="rate-card">
            <div class="rate-num" :style="{ color: rateColor }">{{ (summary.complianceRate * 100).toFixed(1) }}%</div>
            <div class="muted">整体合规率</div>
          </div>
          <div class="count-row">
            <div class="count"><b>{{ summary.totalPlatforms }}</b><span class="muted">台面总数</span></div>
            <div class="count"><b style="color:var(--success)">{{ summary.compliantCount }}</b><span class="muted">合规</span></div>
            <div class="count"><b style="color:var(--danger)">{{ summary.nonCompliantCount }}</b><span class="muted">不合规</span></div>
          </div>
          <div class="section-title" style="border:none;padding-left:0;">风险分布</div>
          <div v-for="(c, k) in riskList" :key="k" class="risk-bar">
            <span class="risk-name">{{ k }}</span>
            <div class="bar-track"><div class="bar-fill" :style="{ width: barPct(c) + '%', background: riskColor(k) }"></div></div>
            <span class="risk-count">{{ c }}</span>
          </div>
          <el-button size="small" type="primary" plain style="margin-top:12px;" @click="$emit('rerun')">重新分析</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="台面列表" name="list">
        <div class="list">
          <div
            v-for="p in platforms"
            :key="p.id"
            class="plat-card"
            :class="{ active: p.id === selectedId, bad: !p.isCompliant }"
            @click="$emit('select', p.id)"
          >
            <div class="plat-head">
              <span class="plat-id">{{ p.id }}</span>
              <el-tag size="small" :type="p.isCompliant ? 'success' : 'danger'">
                {{ p.isCompliant ? '合规' : '不合规' }}
              </el-tag>
            </div>
            <div class="plat-meta">
              <span>{{ typeLabel(p.type) }}</span>
              <span>高程 {{ p.elevation.toFixed(1) }}m</span>
            </div>
            <div class="plat-meta">
              <span>均宽 <b>{{ p.averageWidth.toFixed(1) }}</b>m</span>
              <span :style="{ color: p.minWidth < (p.threshold||0) ? 'var(--danger)' : 'inherit' }">
                最小 <b>{{ p.minWidth.toFixed(1) }}</b>m
              </span>
            </div>
            <div v-if="!p.isCompliant" class="plat-issue muted">{{ (p.complianceIssues || [])[0] }}</div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="阈值配置" name="cfg">
        <div class="cfg">
          <div class="cfg-item">
            <label>安全平台最小宽度 (m)</label>
            <el-slider :model-value="cfg.compliance.safetyPlatformMinWidth" :min="1" :max="20" :step="0.5"
              @update:model-value="(v) => updateThreshold('safetyPlatformMinWidth', v)" :format-tooltip="(v)=>v+'m'" />
          </div>
          <div class="cfg-item">
            <label>清扫平台最小宽度 (m)</label>
            <el-slider :model-value="cfg.compliance.cleaningPlatformMinWidth" :min="1" :max="20" :step="0.5"
              @update:model-value="(v) => updateThreshold('cleaningPlatformMinWidth', v)" :format-tooltip="(v)=>v+'m'" />
          </div>
          <div class="cfg-item">
            <label>运输平台最小宽度 (m)</label>
            <el-slider :model-value="cfg.compliance.transportPlatformMinWidth" :min="1" :max="30" :step="0.5"
              @update:model-value="(v) => updateThreshold('transportPlatformMinWidth', v)" :format-tooltip="(v)=>v+'m'" />
          </div>
          <el-divider />
          <div class="cfg-item">
            <label>台面识别坡度阈值 (°)</label>
            <el-slider :model-value="cfg.analysis.slopeThreshold" :min="5" :max="30" :step="1"
              @update:model-value="(v) => updateParam('slopeThreshold', v)" />
          </div>
          <div class="cfg-item">
            <label>最小台面面积 (m²)</label>
            <el-slider :model-value="cfg.analysis.minPlatformArea" :min="1" :max="100" :step="1"
              @update:model-value="(v) => updateParam('minPlatformArea', v)" />
          </div>
          <div class="cfg-item">
            <label>宽度测量间距 (m)</label>
            <el-slider :model-value="cfg.analysis.widthSampleInterval" :min="0.5" :max="10" :step="0.5"
              @update:model-value="(v) => updateParam('widthSampleInterval', v)" />
          </div>
          <el-button size="small" @click="reset">恢复默认</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script>
import { useConfigStore } from '../stores/config.js';
import { useAnalysisStore } from '../stores/analysis.js';

function typeLabel(t) {
  return { safety: '安全平台', cleaning: '清扫平台', transport: '运输平台', unknown: '工作台面' }[t] || '工作台面';
}
function riskLabel(r) {
  return { high: '高风险', medium: '中风险', low: '低风险', none: '合规' }[r] || r;
}

export default {
  name: 'RightPanel',
  props: {
    platforms: { type: Array, default: () => [] },
    summary: { type: Object, default: null },
    selectedId: { type: String, default: null }
  },
  emits: ['select', 'rerun'],
  data() { return { tab: 'stats' }; },
  computed: {
    cfg() { return useConfigStore().config; },
    analysis() { return useAnalysisStore(); },
    rateColor() {
      const r = this.summary ? this.summary.complianceRate : 1;
      return r >= 0.9 ? 'var(--success)' : r >= 0.7 ? 'var(--warning)' : 'var(--danger)';
    },
    riskList() {
      const d = this.summary ? this.summary.riskDistribution : { high: 0, medium: 0, low: 0, none: 0 };
      return { 高风险: d.high, 中风险: d.medium, 低风险: d.low, 合规: d.none };
    }
  },
  watch: {
    platforms() {
      if (this.tab === 'stats' && this.platforms.length) this.tab = 'stats';
    }
  },
  methods: {
    typeLabel, riskLabel,
    updateThreshold(k, v) { useConfigStore().updateThreshold(k, v); },
    updateParam(k, v) { useConfigStore().updateAnalysisParam(k, v); },
    reset() { useConfigStore().resetDefaults(); },
    barPct(c) {
      const total = Object.values(this.riskList).reduce((a, b) => a + b, 0) || 1;
      return (c / total) * 100;
    },
    riskColor(name) {
      const map = { 高风险: '#f5222d', 中风险: '#fa8c16', 低风险: '#faad14', 合规: '#52c41a' };
      return map[name] || '#888';
    }
  }
};
</script>

<style scoped>
.right-panel { height: 100%; }
.tabs { height: 100%; }
.tabs :deep(.el-tabs__content) { height: calc(100% - 40px); overflow: auto; }
.empty { padding: 30px 12px; text-align: center; }
.stats { padding: 12px; }
.rate-card { text-align: center; padding: 10px; background: var(--bg-elevated); border-radius: 8px; }
.rate-num { font-size: 32px; font-weight: 700; }
.count-row { display: flex; gap: 8px; margin: 12px 0; }
.count { flex: 1; text-align: center; background: var(--bg-elevated); border-radius: 8px; padding: 8px 4px; }
.count b { display: block; font-size: 20px; }
.risk-bar { display: flex; align-items: center; gap: 8px; margin: 8px 0; font-size: 12px; }
.risk-name { width: 48px; }
.risk-count { width: 24px; text-align: right; }
.bar-track { flex: 1; height: 10px; background: var(--bg-elevated); border-radius: 5px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 5px; transition: width .4s; }
.list { padding: 8px; }
.plat-card { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; cursor: pointer; transition: .2s; }
.plat-card:hover { border-color: var(--primary); }
.plat-card.active { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(24,144,255,.3); }
.plat-card.bad { border-left: 3px solid var(--danger); }
.plat-head { display: flex; justify-content: space-between; align-items: center; }
.plat-id { font-weight: 600; }
.plat-meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-dim); margin-top: 4px; }
.plat-issue { margin-top: 4px; font-size: 11px; line-height: 1.4; }
.cfg { padding: 12px; }
.cfg-item { margin-bottom: 14px; }
.cfg-item label { font-size: 12px; color: var(--text-dim); display: block; margin-bottom: 4px; }
</style>
