/**
 * 台面渲染与高亮（渲染层）
 * 把算法输出的台面渲染到 Cesium 场景：
 *   - 台面边界多边形（合规绿 / 不合规红）
 *   - 宽度标注线 + 数值标签
 *   - 不合规区域脉冲高亮动画
 * 本模块只消费数据，不参与分析。
 */
import * as Cesium from 'cesium';
import { localToLonLat } from '../utils/geoUtils.js';

function toCartesian(x, y, h, centerLon, centerLat) {
  const { lon, lat } = localToLonLat(x, y, centerLon, centerLat);
  return Cesium.Cartesian3.fromDegrees(lon, lat, h);
}

export class PlatformRenderer {
  constructor(viewer) {
    this.viewer = viewer;
    this.entities = [];
    this.center = { lon: 0, lat: 0 };
  }

  setCenter(lon, lat) {
    this.center = { lon, lat };
  }

  clear() {
    for (const e of this.entities) this.viewer.entities.remove(e);
    this.entities = [];
  }

  /**
   * @param {Array} platforms 算法输出（含 boundaryPolygon / widthMeasurements / isCompliant）
   * @param {object} config
   */
  render(platforms, config) {
    this.clear();
    const { lon: clon, lat: clat } = this.center;
    const viz = config.visualization;
    const compliantColor = Cesium.Color.fromCssColorString(viz.compliantColor);
    const nonCompliantColor = Cesium.Color.fromCssColorString(viz.nonCompliantColor);

    // 标注密度 -> 采样步长
    const densityStep = viz.annotationDensity === 'sparse' ? 5 : viz.annotationDensity === 'dense' ? 1 : 2;

    for (const p of platforms) {
      const h = p.elevation;
      const baseColor = p.isCompliant ? compliantColor : nonCompliantColor;

      // 1) 边界多边形
      const hierarchy = new Cesium.PolygonHierarchy(
        p.boundaryPolygon.map((pt) => toCartesian(pt.x, pt.y, h, clon, clat))
      );

      let fill;
      if (!p.isCompliant && viz.highlightPulse) {
        // 脉冲：透明度随时间在 [min,max] 间振荡
        const min = viz.highlightPulseMinAlpha;
        const max = viz.highlightPulseMaxAlpha;
        const period = viz.highlightPulsePeriod;
        fill = new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(() => {
            const t = (performance.now() % period) / period;
            const a = min + (max - min) * (0.5 - 0.5 * Math.cos(t * 2 * Math.PI));
            return Cesium.Color.fromCssColorString(viz.nonCompliantColor).withAlpha(a);
          }, false)
        );
      } else {
        fill = baseColor.withAlpha(viz.highlightFillAlpha);
      }

      const poly = this.viewer.entities.add({
        polygon: {
          hierarchy,
          material: fill,
          outline: true,
          outlineColor: baseColor,
          outlineWidth: 2,
          height: h,
          heightReference: Cesium.HeightReference.NONE,
          zIndex: p.isCompliant ? 0 : 1
        }
      });
      this.entities.push(poly);

      // 2) 宽度标注线 + 标签
      let step = densityStep;
      for (let i = 0; i < p.widthMeasurements.length; i += step) {
        const m = p.widthMeasurements[i];
        const left = toCartesian(m.leftEdge.x, m.leftEdge.y, h + 0.5, clon, clat);
        const right = toCartesian(m.rightEdge.x, m.rightEdge.y, h + 0.5, clon, clat);
        const mid = toCartesian(m.x, m.y, h + 1.0, clon, clat);

        const line = this.viewer.entities.add({
          polyline: {
            positions: [left, right],
            width: 2,
            material: m.isCompliant ? compliantColor : nonCompliantColor,
            clampToGround: false
          }
        });
        this.entities.push(line);

        const label = this.viewer.entities.add({
          position: mid,
          label: {
            text: `${m.width.toFixed(1)} m`,
            font: '12px "Microsoft YaHei", sans-serif',
            fillColor: m.isCompliant ? compliantColor : nonCompliantColor,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -8),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(100, 1.0, 2000, 0.6)
          }
        });
        this.entities.push(label);
      }
    }
  }

  /** 飞行定位到指定台面 */
  flyToPlatform(platform) {
    const { lon: clon, lat: clat } = this.center;
    const pos = platform.boundaryPolygon.map((pt) =>
      toCartesian(pt.x, pt.y, platform.elevation, clon, clat)
    );
    if (pos.length === 0) return;
    const bs = Cesium.BoundingSphere.fromPoints(pos);
    this.viewer.camera.flyToBoundingSphere(bs, { duration: 1.2 });
  }
}
