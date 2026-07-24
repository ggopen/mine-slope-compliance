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

// Cesium 离线友好
Cesium.Ion.defaultAccessToken = '';

const cfg = useConfigStore();
cfg.applyTheme();

app.mount('#app');
