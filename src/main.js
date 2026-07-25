import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import App from './App.vue';
import './styles/global.scss';
import { useConfigStore } from './stores/config.js';

const app = createApp(App);
app.use(createPinia());
app.use(ElementPlus);

// 注意：Cesium Ion token 已在 src/render/scene.js 中设置
// 请勿在此处再次清空，否则真实地形/影像服务将无法访问

const cfg = useConfigStore();
cfg.applyTheme();

app.mount('#app');
