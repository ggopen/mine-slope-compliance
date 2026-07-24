# 团队技术提升指南（Senior Developer 视角）

本文档不是 API 文档，而是**工程方法论**——目的是让团队在维护、扩展本系统时保持一致的代码质量与架构纪律。每一节都对应一个真实踩过的坑或一条可落地的规范。

---

## 1. 架构第一原则：算法层与渲染层彻底解耦

### 为什么
`src/algorithm/*` 全部是**纯函数**，只处理数值网格与平面坐标（米），**不 import 任何 Cesium**。这让：

- 算法可以在 **Node 里直接跑单测**（`node test/pipeline.test.mjs`），无需启动浏览器、无需 WebGL。
- 算法可以放进 **Web Worker** 并行执行，不阻塞 UI 线程。
- 算法与 Cesium 版本解耦，升级 Cesium 不会破坏识别逻辑。

### 纪律（必须）
- 新增识别/测量逻辑，**只写在 `src/algorithm/`**，且不能出现 `import * as Cesium`。
- 需要经纬度 ↔ 局部坐标换算时，用 `src/utils/geoUtils.js`（纯数学）。
- 任何依赖 `Cartesian3` / `Viewer` 的代码必须放在 `src/render/` 或组件里。

> 反例（禁止）：在坡度计算函数里直接调 `viewer.scene.sampleHeight`。这会让算法无法测试、无法离线运行。

---

## 2. 数据单向流动，禁止循环依赖

```
数据生成(src/data, src/render 采样)
   ↓ DEM 对象（普通数据，可结构化克隆）
算法层(src/algorithm, 运行于 Worker)
   ↓ 台面列表（普通数据）
渲染层(src/render, 主线程)
   ↓ 实体/图元
Cesium 场景
```

- DEM 是一个**普通对象**（`{ cols, rows, heights, ... }`），不是 Cesium 对象 → 能直接 `postMessage` 给 Worker。
- 台面结果也是**普通数据** → 渲染层只消费，不参与计算。

---

## 3. 性能：重计算永远放 Worker

- 坡度、连通区域、Alpha Shape、宽度测量都是 O(N) 或更高，N 可达数十万。必须走 `src/workers/analysis.worker.js`。
- 主线程只做：DEM 生成（真实数据需 `scene.sampleHeight`）、渲染、UI。
- 已做防抖：阈值滑块变更后 500ms 才重算（`App.vue` 的 `debounce`），避免拖动时狂算。

**扩展新计算**时：在 `pipeline.js` 串起来，Worker 无需改动即可生效。

---

## 4. 配置集中化

所有阈值、算法参数、可视化样式都在 `src/config/defaults.js`，并通过 `useConfigStore` 持久化到 `localStorage`。

- 新增可调参数 → 加在 `DEFAULT_CONFIG`，不要写在组件里硬编码。
- 修改默认值要评估对「程序化样例验证脚本」的影响。

---

## 5. 我们已经踩过、你也要记住的坑

### 坑 1：连通区域标签回退导致区域合并
初版在面积过滤不达标时 `labelCount--` 想"回收"标签，但已标记的细胞不会取消，下一区域复用同一标签号 → 两个区域被错误合并。
**规则**：标签严格顺序分配、绝不回退复用，过滤放到收集阶段做。

### 坑 2：边缘坡度梯度裁掉台面边界
坡度检测在"平台→边坡"过渡的 1~2 格处，因局部梯度变大而被判为陡坡，导致台面宽度被系统性低估（8m 台实测 6~7m）。
**修复**：识别后对二值掩膜做 `edgeDilation`（默认 1 格）形态学膨胀，恢复边缘。对应 `analysis.edgeDilation` 参数。

### 坑 3：类型分类不能依赖面积
露天矿台阶很长，单个台面面积可达数千 m²，用 `area < 400` 判断类型会把所有长台阶判成 `unknown`。
**修复**：`classifyType` 改为**仅按平均宽度分段**。

### 坑 4：Cesium 截图需要 preserveDrawingBuffer
`canvas.toDataURL()` 默认可能得到空白，因为 WebGL 绘制缓冲未保留。
**修复**：`MineScene` 构造时 `contextOptions: { preserveDrawingBuffer: true }`。

---

## 6. 代码质量要求（Definition of Done）

- [ ] 新算法逻辑有纯函数实现，能通过 Node 单测验证
- [ ] 重计算在 Worker 中，主线程不卡顿
- [ ] 新增配置项进入 `defaults.js`，不从组件硬编码
- [ ] 关键函数有 JSDoc（入参/出参/单位）
- [ ] 类型/阈值变化有 UI 反馈且能持久化
- [ ] 不引入与 Cesium 的循环依赖
- [ ] 构建通过（`npm run build`），单测通过

---

## 7. 推荐的学习路径（给团队）

1. 先读 `test/pipeline.test.mjs`，跑一遍，看输入输出——建立对"算法层独立可测"的直觉。
2. 精读 `src/algorithm/pipeline.js`，理解每一步的数据形态。
3. 再看 `src/render/platformRender.js`，理解"数据如何变成三维高亮"。
4. 最后看 `src/workers/analysis.worker.js` + `src/modules/analysisEngine.js`，理解主线程与 Worker 的协作契约。

> 核心心法：**能离线测试的代码才是好代码；能放进 Worker 的重计算才不会影响体验；配置集中才不会失控。**
