# 矿山边坡工作台面合规性检查系统

基于 **CesiumJS** 的矿山边坡工作台面合规性检查前端系统：加载实景三维模型（3D Tiles），自动识别边坡工作台面，测量台面宽度，并将宽度低于阈值的区域以脉冲高亮预警。

> 零数据即可演示：系统内置「程序化矿山样例」，一键加载即可看到完整的识别 → 测量 → 合规判定 → 高亮全流程。真实数据通过 3D Tiles URL 接入。

## 技术栈

| 层 | 技术 |
|----|------|
| 三维引擎 | CesiumJS 1.119 |
| 前端框架 | Vue 3 + Vite 5 |
| UI 组件 | Element Plus |
| 状态管理 | Pinia |
| 几何计算 | d3-delaunay（Delaunay / Alpha Shape） |
| 重计算 | Web Worker（不阻塞 UI） |
| 报告 | SheetJS（Excel）、html2canvas + jsPDF（PDF） |

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务器（默认 http://localhost:5173）
npm run build      # 生产构建
npm run preview    # 预览构建产物
```

启动后点击顶部「加载示例矿山」，系统会自动完成分析并高亮不合规台面。

## 两种数据路径

1. **程序化样例（零数据）**：点击「加载示例矿山」，内部生成阶梯式边坡 DEM 与三维网格。
2. **真实 3D Tiles**：点击「加载 3D Tiles」，填入 `tileset.json` 地址，系统从模型表面采样生成 DEM 后分析。

## 目录结构

```
src/
├── algorithm/         # 核心算法层（纯函数，无 Cesium 依赖，可单测）
│   ├── slope.js           # 坡度计算（Horn 法）
│   ├── detectPlatforms.js # 台面连通区域识别 + 边缘膨胀
│   ├── boundary.js        # Alpha Shape 边界提取
│   ├── width.js           # 宽度测量（PCA 主轴 + 射线求交）
│   ├── compliance.js      # 合规判定与风险分级
│   └── pipeline.js        # 流水线编排
├── workers/           # Web Worker 入口（运行 pipeline）
├── render/            # 渲染层（Cesium 相关，只做渲染与坐标）
│   ├── scene.js           # Viewer / 3D Tiles / 高程采样
│   └── platformRender.js  # 台面多边形 / 宽度标注 / 脉冲高亮
├── data/syntheticMine.js  # 程序化样例数据生成
├── stores/            # Pinia 状态（config / analysis）
├── components/        # Vue 组件（工具栏 / 图层 / 场景 / 右侧面板）
├── modules/           # 分析引擎封装 / 报告导出
├── config/defaults.js # 集中配置（阈值、算法参数、可视化）
└── utils/geoUtils.js  # 纯地理/几何工具
```

## 算法流水线

```
DEM 高程网格
  → 坡度计算（Horn 有限差分）
  → 坡度阈值分割 + 8 连通区域 + 面积过滤 + 边缘膨胀
  → Alpha Shape 边界提取
  → PCA 主轴中心线 + 法线方向射线求交 → 台面宽度
  → 合规判定（宽度 vs 阈值）+ 风险分级
```

## 验证算法

核心算法为纯函数，可在 Node 中直接测试（无需浏览器）：

```bash
node test/pipeline.test.mjs
```

预期输出：识别 6 个台阶，其中 1 个窄台面（3.0m < 安全平台阈值 5m）被判为不合规。

## 法规依据

GB 16423-2020《金属非金属矿山安全规程》：安全平台 ≥ 5m、清扫平台 ≥ 6m、运输平台 ≥ 8m（阈值可在界面配置）。
