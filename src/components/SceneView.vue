<template>
  <div ref="container" class="cesium-container"></div>
</template>

<script>
export default {
  name: 'SceneView',
  emits: ['ready'],
  mounted() {
    this.$emit('ready', this.$refs.container);
  }
};
</script>

<style scoped>
.cesium-container {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
}
:deep(.cesium-widget-credits) { display: none !important; }
</style>
