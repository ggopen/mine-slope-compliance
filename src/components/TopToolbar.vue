<template>
  <div class="toolbar">
    <div class="brand">
      <span class="logo">⛰</span>
      <span class="title">矿山边坡合规性检查</span>
    </div>
    <div class="actions">
      <el-button size="small" type="primary" @click="$emit('load-sample')">加载实景模型</el-button>
      <el-button size="small" @click="promptTiles">加载 3D Tiles</el-button>
      <el-divider direction="vertical" />
      <el-button size="small" :loading="status === 'loading'" @click="$emit('run')">开始分析</el-button>
      <el-button size="small" @click="$emit('fly')">定位</el-button>
      <el-divider direction="vertical" />
      <el-button size="small" @click="$emit('screenshot')">截图</el-button>
      <el-button size="small" @click="$emit('export-excel')">导出 Excel</el-button>
      <el-button size="small" @click="$emit('export-pdf')">导出报告</el-button>
      <el-divider direction="vertical" />
      <el-button size="small" circle @click="$emit('theme')" :title="themeTitle">🌓</el-button>
    </div>
  </div>
</template>

<script>
import { ElMessageBox } from 'element-plus';
import { useConfigStore } from '../stores/config.js';

export default {
  name: 'TopToolbar',
  props: { status: { type: String, default: 'idle' } },
  emits: ['load-sample', 'load-tiles', 'run', 'export-excel', 'export-pdf', 'screenshot', 'fly', 'theme'],
  computed: {
    themeTitle() {
      return useConfigStore().theme === 'dark' ? '切换为亮色' : '切换为暗色';
    }
  },
  methods: {
    async promptTiles() {
      try {
        const { value } = await ElMessageBox.prompt('请输入 3D Tiles 的 tileset.json 地址', '加载实景模型', {
          confirmButtonText: '加载',
          cancelButtonText: '取消',
          inputPlaceholder: 'https://example.com/tileset.json'
        });
        if (value) this.$emit('load-tiles', value.trim());
      } catch (e) {
        /* 取消 */
      }
    }
  }
};
</script>

<style scoped>
.toolbar {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 12px;
}
.brand { display: flex; align-items: center; gap: 6px; margin-right: 8px; }
.logo { font-size: 18px; }
.title { font-weight: 600; font-size: 14px; }
.actions { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
</style>
