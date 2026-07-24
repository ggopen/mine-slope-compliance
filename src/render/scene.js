/**
 * Cesium 场景封装（渲染层）
 * 职责：初始化 Viewer、加载程序化样例网格、加载真实 3D Tiles、
 *       从模型表面采样生成 DEM、相机定位。
 * 设计：本模块只做「渲染与坐标」，不含任何分析算法（算法在 src/algorithm）。
 */
import * as Cesium from 'cesium';
import { gridSteps, lonLatToLocal, localToLonLat } from '../utils/geoUtils.js';

// 离线友好：不依赖 Cesium Ion Token
Cesium.Ion.defaultAccessToken = '';

export class MineScene {
  constructor(container) {
    this.viewer = new Cesium.Viewer(container, {
      baseLayer: false,
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
      contextOptions: { preserveDrawingBuffer: true }
    });

    this.viewer.scene.globe.show = true;
    this.viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0b1a2a');
    this.viewer.scene.skyAtmosphere.show = false;
    this.viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0b1a2a');

    this.tileset = null;
    this.meshPrimitive = null;
    this.center = { lon: 0, lat: 0 };
    this.sizeMeters = 400;
  }

  /** 飞至模型范围 */
  flyToModel() {
    if (this.tileset) {
      this.viewer.flyTo(this.tileset, { duration: 1.5 });
    } else if (this.meshPrimitive) {
      this.viewer.flyTo(this.meshPrimitive, { duration: 1.5 });
    }
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
   * 从已加载模型表面采样生成 DEM
   * @param {object} config
   * @param {object} [override] 可选 {center, sizeMeters}
   */
  async sampleDEM(config, override) {
    const center = override?.center || this.center;
    const sizeMeters = override?.sizeMeters || this.sizeMeters;
    const res = config.analysis.samplingResolution;
    const centerLon = center.lon;
    const centerLat = center.lat;
    const half = sizeMeters / 2;
    const { lonStep, latStep } = gridSteps(centerLat, res);
    const cols = Math.ceil(sizeMeters / res) + 1;
    const rows = cols;
    const minLon = centerLon - (cols - 1) * lonStep / 2;
    const minLat = centerLat - (rows - 1) * latStep / 2;

    const heights = new Float32Array(cols * rows);
    const xs = new Float32Array(cols * rows);
    const ys = new Float32Array(cols * rows);

    // 先渲染一帧，确保深度缓冲可用（sampleHeight 依赖）
    this.viewer.render();

    const sampleCount = cols * rows;
    if (sampleCount > config.analysis.maxSamplingPoints) {
      throw new Error(`采样点数 ${sampleCount} 超过上限 ${config.analysis.maxSamplingPoints}，请增大采样间距`);
    }

    const exclude = this.tileset ? [this.tileset] : [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const lon = minLon + col * lonStep;
        const lat = minLat + row * latStep;
        const carto = Cesium.Cartographic.fromDegrees(lon, lat);
        let h = this.viewer.scene.sampleHeight(carto, exclude, 1);
        if (h === undefined || Number.isNaN(h)) h = NaN; // 模型外区域标记为无数据
        const idx = row * cols + col;
        heights[idx] = h;
        const { x, y } = lonLatToLocal(lon, lat, centerLon, centerLat);
        xs[idx] = x;
        ys[idx] = y;
      }
    }

    // 填补无数据区域（用最近有效值，避免误判）
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
