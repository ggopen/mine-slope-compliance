/**
 * Cesium 场景封装（渲染层）
 * 职责：初始化 Viewer、加载程序化样例网格、加载真实 3D Tiles、
 *       从模型表面采样生成 DEM、相机定位。
 * 设计：本模块只做「渲染与坐标」，不含任何分析算法（算法在 src/algorithm）。
 */
import * as Cesium from 'cesium';
import { gridSteps, lonLatToLocal, localToLonLat } from '../utils/geoUtils.js';

// 使用 Cesium 官方提供的评估用默认 token（仅用于演示）
// 生产环境请替换为你自己的 ion token：https://cesium.com
Cesium.Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYmFiY2M4Yy00ZDE1LTQwY2YtODJkYS04MGJiNWVjNzkxZjMiLCJpZCI6MjU5LCJpYXQiOjE3Njc2MjcyMzR9.tShykOZPNZIHyBljG1bvvQMwpbLFjmq6vdhfI097SpI';

export class MineScene {
  constructor(container) {
    this.viewer = new Cesium.Viewer(container, {
      // 真实卫星影像底图（Cesium World Imagery，通过默认 token 访问）
      baseLayer: Cesium.ImageryLayer.fromProviderAsync(
        Cesium.IonImageryProvider.fromAssetId(2),
        {}
      ),
      // 真实全球地形（Cesium World Terrain，通过默认 token 访问）
      terrain: Cesium.Terrain.fromWorldTerrain({
        requestWaterMask: false,
        requestVertexNormals: true
      }),
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: true,
      infoBox: false,
      selectionIndicator: false,
      shouldAnimate: true,
      contextOptions: { preserveDrawingBuffer: true },
      showRenderLoopErrors: false  // 自己捕获并展示中文错误
    });

    // 真实地球渲染设置
    this.viewer.scene.globe.show = true;
    this.viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a3a5c');
    this.viewer.scene.skyAtmosphere.show = true;
    this.viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0b1a2a');
    this.viewer.scene.sun.show = true;
    this.viewer.scene.moon.show = false;

    this.tileset = null;
    this.meshPrimitive = null;
    this.center = { lon: 0, lat: 0 };
    this.sizeMeters = 400;
    this._terrainReady = false;
  }

  /** 飞至模型范围 */
  flyToModel() {
    if (this.tileset) {
      this.viewer.flyTo(this.tileset, { duration: 1.5 });
    } else if (this.meshPrimitive) {
      this.viewer.flyTo(this.meshPrimitive, { duration: 1.5 });
    } else if (this.center.lon !== 0) {
      // 飞到真实地形位置
      const dest = Cesium.Cartesian3.fromDegrees(
        this.center.lon, this.center.lat - 0.003,
        this.sizeMeters * 0.8
      );
      this.viewer.camera.flyTo({
        destination: dest,
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-35),
          roll: 0
        },
        duration: 1.5
      });
    }
  }

  /** 等待地形 provider 就绪 */
  async _waitForTerrain(timeout = 20000) {
    if (this._terrainReady) return;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const globe = this.viewer.scene.globe;
      if (globe && globe.terrainProvider) {
        const provider = globe.terrainProvider;
        // 检查是否已经从默认椭球升级为真实地形
        // EllipsoidTerrainProvider 没有 _quantizedHeight，真实地形 provider 有
        if (provider && provider.ready !== false &&
            provider.constructor && provider.constructor.name !== 'EllipsoidTerrainProvider') {
          this._terrainReady = true;
          return;
        }
        // 或者检查是否有 readyEvent
        if (globe.terrainProviderChanged) {
          this._terrainReady = true;
          return;
        }
      }
      await new Promise(r => setTimeout(r, 300));
    }
    // 超时也不报错，让后续采样尽力而行
    this._terrainReady = true;
  }

  /** 模型显隐 */
  setModelVisible(v) {
    if (this.meshPrimitive) this.meshPrimitive.show = v;
    if (this.tileset) this.tileset.show = v;
  }

  /** 加载程序化样例网格（每格一个着色四边形） */
  loadSyntheticMine(meshCells) {
    if (this.meshPrimitive) {
      this.viewer.scene.primitives.remove(this.meshPrimitive);
      this.meshPrimitive = null;
    }
    const instances = [];
    for (const cell of meshCells) {
      const positions = [];
      for (const [lon, lat, h] of cell.corners) {
        const c = Cesium.Cartesian3.fromDegrees(lon, lat, h);
        positions.push(c.x, c.y, c.z);
      }
      const geometry = new Cesium.Geometry({
        attributes: {
          position: new Cesium.GeometryAttribute({
            componentDatatype: Cesium.ComponentDatatype.DOUBLE,
            componentsPerAttribute: 3,
            values: new Float64Array(positions)
          })
        },
        indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
        primitiveType: Cesium.PrimitiveType.TRIANGLES
      });
      const color = new Cesium.Color(cell.color[0], cell.color[1], cell.color[2], 1);
      instances.push(
        new Cesium.GeometryInstance({
          geometry,
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) }
        })
      );
    }
    this.meshPrimitive = new Cesium.Primitive({
      geometryInstances: instances,
      appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: false }),
      asynchronous: false
    });
    this.viewer.scene.primitives.add(this.meshPrimitive);
  }

  /** 加载真实 3D Tiles 实景模型 */
  async load3DTiles(url) {
    if (this.tileset) {
      this.viewer.scene.primitives.remove(this.tileset);
      this.tileset = null;
    }
    const tileset = await Cesium.Cesium3DTileset.fromUrl(url, {
      maximumScreenSpaceError: 16,
      maximumMemoryUsage: 1024,
      dynamicScreenSpaceError: true,
      skipLevelOfDetail: true
    });
    this.tileset = tileset;
    this.viewer.scene.primitives.add(tileset);

    // 计算模型中心用于坐标换算
    const center = tileset.boundingSphere.center;
    const carto = Cesium.Cartographic.fromCartesian(center);
    this.center = {
      lon: Cesium.Math.toDegrees(carto.longitude),
      lat: Cesium.Math.toDegrees(carto.latitude)
    };
    this.sizeMeters = tileset.boundingSphere.radius * 2;
    return tileset;
  }

  /**
   * 从地形/模型表面采样生成 DEM
   * 使用 Cesium 的 sampleTerrainMostDetailed 直接从地形 provider 获取高程，
   * 同时用 scene.sampleHeight 作为后备（用于 3D Tiles 模型表面）。
   * @param {object} config
   * @param {object} [override] 可选 {center, sizeMeters}
   */
  async sampleDEM(config, override) {
    const center = override?.center || this.center;
    const sizeMeters = override?.sizeMeters || this.sizeMeters;
    const res = config.analysis.samplingResolution;
    const centerLon = center.lon;
    const centerLat = center.lat;
    const { lonStep, latStep } = gridSteps(centerLat, res);
    const cols = Math.ceil(sizeMeters / res) + 1;
    const rows = cols;
    const minLon = centerLon - (cols - 1) * lonStep / 2;
    const minLat = centerLat - (rows - 1) * latStep / 2;

    const heights = new Float32Array(cols * rows);
    const xs = new Float32Array(cols * rows);
    const ys = new Float32Array(cols * rows);

    const sampleCount = cols * rows;
    if (sampleCount > config.analysis.maxSamplingPoints) {
      throw new Error(`采样点数 ${sampleCount} 超过上限 ${config.analysis.maxSamplingPoints}，请增大采样间距`);
    }

    // 构建所有采样点的 Cartographic 数组
    const positions = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const lon = minLon + col * lonStep;
        const lat = minLat + row * latStep;
        positions.push(Cesium.Cartographic.fromDegrees(lon, lat));
      }
    }

    // 等待地形 provider 就绪
    await this._waitForTerrain();

    // 方法1：用 sampleTerrainMostDetailed 从地形 provider 获取精确高程
    const terrainProvider = this.viewer.scene.globe.terrainProvider;
    let sampledHeights = null;
    try {
      const updated = await Cesium.sampleTerrainMostDetailed(terrainProvider, positions.slice());
      sampledHeights = updated.map(p => p.height);
    } catch (e) {
      console.warn('sampleTerrainMostDetailed 失败，尝试 sampleHeight 后备方案', e);
    }

    // 方法2：如果方法1失败或数据缺失，用 scene.sampleHeight 后备
    if (!sampledHeights || sampledHeights.some(h => h === undefined || Number.isNaN(h))) {
      // 飞到采样区域，渲染画面使 sampleHeight 可用
      const camDest = Cesium.Cartesian3.fromDegrees(centerLon, centerLat - 0.002, sizeMeters * 0.8);
      this.viewer.camera.setView({
        destination: camDest,
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-45), roll: 0 }
      });
      // 多次渲染以确保地形瓦片加载
      for (let i = 0; i < 6; i++) {
        this.viewer.render();
        await new Promise(r => setTimeout(r, 400));
      }
      const exclude = this.tileset ? [this.tileset] : [];
      for (let i = 0; i < positions.length; i++) {
        if (sampledHeights && !Number.isNaN(sampledHeights[i]) && sampledHeights[i] !== undefined) continue;
        try {
          const h = this.viewer.scene.sampleHeight(positions[i], exclude, 1);
          if (sampledHeights) sampledHeights[i] = h;
          else sampledHeights = sampledHeights || new Array(positions.length).fill(NaN), sampledHeights[i] = h;
        } catch {
          // 保持 NaN
        }
      }
    }

    if (!sampledHeights) {
      throw new Error('无法从地形获取高程数据，请检查网络连接或更换采样区域');
    }

    // 写入 DEM
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        let h = sampledHeights[idx];
        if (h === undefined || h === null || Number.isNaN(h)) h = NaN;
        heights[idx] = h;
        const lon = minLon + col * lonStep;
        const lat = minLat + row * latStep;
        const { x, y } = lonLatToLocal(lon, lat, centerLon, centerLat);
        xs[idx] = x;
        ys[idx] = y;
      }
    }

    // 填补无数据区域
    fillNoData(heights, cols, rows);

    return {
      cols, rows, heights, xs, ys, cellSize: res,
      centerLon, centerLat, lonStep, latStep, minLon, minLat,
      bounds: {
        minLon, minLat,
        maxLon: minLon + (cols - 1) * lonStep,
        maxLat: minLat + (rows - 1) * latStep
      }
    };
  }

  destroy() {
    if (this.tileset) this.viewer.scene.primitives.remove(this.tileset);
    if (this.meshPrimitive) this.viewer.scene.primitives.remove(this.meshPrimitive);
    this.viewer.destroy();
  }
}

/** 用最近邻有效值填补 NaN（四邻域扩散） */
function fillNoData(heights, cols, rows) {
  const out = heights.slice();
  for (let iter = 0; iter < 2; iter++) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        if (!Number.isNaN(heights[idx])) continue;
        let sum = 0, cnt = 0;
        for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nc = col + dc, nr = row + dr;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          const v = out[nr * cols + nc];
          if (!Number.isNaN(v)) { sum += v; cnt++; }
        }
        if (cnt > 0) out[idx] = sum / cnt;
      }
    }
    heights.set(out);
  }
}
