<template>
  <div class="app-shell">
    <header class="area-header panel">
      <TopToolbar
        :status="analysis.status"
        @load-sample="loadSample"
        @load-tiles="loadTiles"
        @run="runAnalysis"
        @export-excel="doExportExcel"
        @export-pdf="doExportPDF"
        @screenshot="screenshot"
        @fly="flyToModel"
        @theme="toggleTheme"
      />
    </header>

    <aside class="area-left panel">
      <LayerPanel
        :model-visible="ui.modelVisible"
        :platform-visible="ui.platformVisible"
        :density="config.visualization.annotationDensity"
        @update:model-visible="setModelVisible"
        @update:platform-visible="setPlatformVisible"
        @update:density="setDensity"
      />
    </aside>

    <main class="area-scene">
      <SceneView @ready="onSceneReady" />
      <div v-if="analysis.status === 'loading'" class="loading-overlay">
        <div class="spinner"></div>
        <div class="muted">{{ analysis.progressText }}</div>
      </div>
      <div v-if="analysis.status === 'error'" class="error-toast">
        ⚠ {{ analysis.errorMessage }}
      </div>
    </main>

    <aside class="area-right panel">
      <RightPanel
        :platforms="analysis.platforms"
        :summary="analysis.summary"
        :selected-id="analysis.selectedId"
        @select="onSelectPlatform"
        @rerun="runAnalysis"
      />
    </aside>

    <footer class="area-footer panel" style="display:flex;align-items:center;padding:0 12px;font-size:12px;color:var(--text-dim);">
      <span>矿山边坡工作台面合规性检查系统 v1.0</span>
      <span style="margin-left:auto;">数据源：{{ dataSourceLabel }} ｜ 台面：{{ analysis.platforms.length }} ｜
        合规率：{{ (analysis.summary ? (analysis.summary.complianceRate * 100).toFixed(1) : '0.0') }}%</span>
    </footer>
  </div>
</template>

<script>
import TopToolbar from './components/TopToolbar.vue';
import LayerPanel from './components/LayerPanel.vue';
import SceneView from './components/SceneView.vue';
import RightPanel from './components/RightPanel.vue';
import { MineScene } from './render/scene.js';
import { PlatformRenderer } from './render/platformRender.js';
import { AnalysisEngine } from './modules/analysisEngine.js';
import { buildSyntheticDEM, buildSyntheticMesh } from './data/syntheticMine.js';
import { exportExcel, exportPDF } from './modules/report.js';
import { useConfigStore } from './stores/config.js';
import { useAnalysisStore } from './stores/analysis.js';

function debounce(fn, wait) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), wait);
  };
}

export default {
  name: 'App',
  components: { TopToolbar, LayerPanel, SceneView, RightPanel },
  data() {
    return {
      ui: { modelVisible: true, platformVisible: true },
      lastPlatforms: []
    };
  },
  computed: {
    config() { return useConfigStore().config; },
    analysis() { return useAnalysisStore(); },
    dataSourceLabel() {
      return { none: '未加载', synthetic: '程序化样例', tiles: '3D Tiles 实景模型', terrain: '真实地形数据' }[this.analysis.dataSource] || '未加载';
    }
  },
  methods: {
    onSceneReady(el) {
      try {
        this.scene = new MineScene(el);
        this.renderer = new PlatformRenderer(this.scene.viewer);
        this.engine = new AnalysisEngine();
        // 阈值/参数变更 -> 防抖自动重算
        this._rerun = debounce(() => this.runAnalysis(), 500);
        this.$watch(
          () => this.config,
          () => { if (this.analysis.status === 'done' && this.dem) this._rerun(); },
          { deep: true }
        );
        // 首屏自动加载样例，便于团队立即验证
        this.loadSample();
      } catch (e) {
        console.error(e);
        useAnalysisStore().setError('三维场景初始化失败：请使用支持 WebGL 的现代浏览器（Chrome/Edge/Firefox），并检查显卡驱动已启用。');
      }
    },

    // 用户提供的在线 3D Tiles 实景模型（祁县寺庙实景数据）
    // 虽然不是矿山，但可用来验证边坡台面识别、宽度测量、合规判定的完整业务逻辑
    SAMPLE_TILES_URL: 'https://data.mars3d.cn/3dtiles/qx-simiao/tileset.json',

    async loadSample() {
      if (!this.scene) return;
      const cfg = useConfigStore().config;
      const store = useAnalysisStore();
      store.setLoading('正在加载 3D Tiles 实景模型...');
      try {
        // 加载用户提供的真实 3D Tiles 模型
        await this.scene.load3DTiles(this.SAMPLE_TILES_URL);
        this.scene.flyToModel();
        store.setLoading('正在从模型表面采样高程...');
        // 从 3D Tiles 模型表面采样生成 DEM
        const dem = await this.scene.sampleDEM(cfg);
        this.renderer.setCenter(this.scene.center.lon, this.scene.center.lat);
        this.dem = dem;
        this.ui.modelVisible = true;
        store.dataSource = 'tiles';
        store.setLoading('正在识别边坡工作台面...');
        this.runAnalysis();
      } catch (e) {
        console.error('3D Tiles 加载失败，回退到真实地形采样', e);
        // 回退方案1：用 Cesium 全球地形采样
        try {
          this.scene.center = { lon: cfg.demoMine.centerLon, lat: cfg.demoMine.centerLat };
          this.scene.sizeMeters = cfg.demoMine.sizeMeters;
          this.scene.flyToModel();
          const dem = await this.scene.sampleDEM(cfg);
          this.renderer.setCenter(cfg.demoMine.centerLon, cfg.demoMine.centerLat);
          this.dem = dem;
          this.ui.modelVisible = true;
          store.dataSource = 'terrain';
          this.runAnalysis();
        } catch (e2) {
          console.error('地形采样也失败，回退到程序化样例', e2);
          // 回退方案2：程序化样例 DEM
          const dem = buildSyntheticDEM(cfg);
          const mesh = buildSyntheticMesh(cfg);
          this.scene.center = { lon: cfg.demoMine.centerLon, lat: cfg.demoMine.centerLat };
          this.scene.sizeMeters = cfg.demoMine.sizeMeters;
          this.scene.loadSyntheticMine(mesh);
          this.renderer.setCenter(cfg.demoMine.centerLon, cfg.demoMine.centerLat);
          this.dem = dem;
          this.ui.modelVisible = true;
          store.dataSource = 'synthetic';
          this.runAnalysis();
        }
      }
    },

    async loadTiles(url) {
      try {
        const cfg = useConfigStore().config;
        await this.scene.load3DTiles(url);
        this.scene.flyToModel();
        const dem = await this.scene.sampleDEM(cfg);
        this.renderer.setCenter(this.scene.center.lon, this.scene.center.lat);
        this.dem = dem;
        this.ui.modelVisible = true;
        useAnalysisStore().dataSource = 'tiles';
        this.runAnalysis();
      } catch (e) {
        useAnalysisStore().setError(e.message || '加载 3D Tiles 失败');
      }
    },

    async runAnalysis() {
      if (!this.dem || !this.engine) return;
      const cfg = useConfigStore().config;
      const store = useAnalysisStore();
      store.setLoading('正在识别边坡工作台面...');
      try {
        const { platforms, summary } = await this.engine.analyze(this.dem, cfg);
        if (this.renderer) this.renderer.render(platforms, cfg);
        this.lastPlatforms = platforms;
        store.setResult({ platforms, summary }, this.analysis.dataSource);
      } catch (e) {
        store.setError(e.message || '分析失败');
      }
    },

    onSelectPlatform(id) {
      useAnalysisStore().select(id);
      const p = this.analysis.platforms.find((x) => x.id === id);
      if (p) this.renderer.flyToPlatform(p);
    },

    setModelVisible(v) {
      this.ui.modelVisible = v;
      this.scene.setModelVisible(v);
    },
    setPlatformVisible(v) {
      this.ui.platformVisible = v;
      if (v && this.lastPlatforms.length) this.renderer.render(this.lastPlatforms, useConfigStore().config);
      else this.renderer.clear();
    },
    setDensity(v) {
      useConfigStore().setVisualization('annotationDensity', v);
      if (this.lastPlatforms.length) this.renderer.render(this.lastPlatforms, useConfigStore().config);
    },

    flyToModel() { this.scene.flyToModel(); },
    toggleTheme() { useConfigStore().toggleTheme(); },

    screenshot() {
      if (!this.scene) return;
      const url = this.scene.viewer.canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `边坡截图-${Date.now()}.png`;
      a.click();
    },

    async doExportExcel() {
      const cfg = useConfigStore().config;
      if (!this.analysis.platforms.length) { useAnalysisStore().setError('暂无分析结果'); return; }
      exportExcel(this.analysis.platforms, this.analysis.summary, cfg, '示例矿山');
    },
    async doExportPDF() {
      const cfg = useConfigStore().config;
      if (!this.analysis.platforms.length) { useAnalysisStore().setError('暂无分析结果'); return; }
      const shot = this.scene ? this.scene.viewer.canvas.toDataURL('image/png') : null;
      await exportPDF(this.analysis.platforms, this.analysis.summary, cfg, shot, '示例矿山');
    }
  }
};
</script>

<style scoped>
.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  z-index: 10;
}
.spinner {
  width: 38px;
  height: 38px;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-toast {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--danger);
  color: #fff;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  z-index: 20;
}
</style>
