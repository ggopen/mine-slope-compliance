<template>
  <div class="layer-panel">
    <div class="section-title">图层管理</div>
    <div class="row">
      <span>实景模型 / 网格</span>
      <el-switch :model-value="modelVisible" @update:model-value="$emit('update:model-visible', $event)" />
    </div>
    <div class="row">
      <span>台面与标注</span>
      <el-switch :model-value="platformVisible" @update:model-value="$emit('update:platform-visible', $event)" />
    </div>
    <div class="row col">
      <span>标注密度</span>
      <el-select
        :model-value="density"
        size="small"
        style="width: 120px"
        @update:model-value="$emit('update:density', $event)"
      >
        <el-option label="稀疏" value="sparse" />
        <el-option label="中等" value="medium" />
        <el-option label="密集" value="dense" />
      </el-select>
    </div>

    <div class="section-title" style="margin-top:10px;">图例</div>
    <div class="legend">
      <div class="item"><i style="background:#52c41a"></i>合规</div>
      <div class="item"><i style="background:#faad14"></i>低风险</div>
      <div class="item"><i style="background:#fa8c16"></i>中风险</div>
      <div class="item"><i style="background:#f5222d"></i>高风险 / 不合规</div>
    </div>
    <div class="muted" style="padding:10px 12px;line-height:1.6;">
      绿色为合规台面，红色为宽度不达标区域（带脉冲高亮）。点击右侧台面列表可定位查看。
    </div>
  </div>
</template>

<script>
export default {
  name: 'LayerPanel',
  props: {
    modelVisible: Boolean,
    platformVisible: Boolean,
    density: { type: String, default: 'medium' }
  },
  emits: ['update:model-visible', 'update:platform-visible', 'update:density']
};
</script>

<style scoped>
.layer-panel { padding-bottom: 12px; }
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 13px;
}
.row.col { flex-direction: column; align-items: stretch; gap: 6px; }
.legend { padding: 4px 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px; }
.legend .item { display: flex; align-items: center; gap: 6px; }
.legend i { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
</style>
