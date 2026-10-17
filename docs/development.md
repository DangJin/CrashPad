# 开发与验证

[返回项目首页](../README.md)

## 验证与构建

```sh
npm run check
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

浏览器测试覆盖桌面和手机模拟环境，以及实际 PNG、JPG、GIF 下载。截图和下载样本输出到被 Git 忽略的 `test-results/`。

已有本项目开发服务时，复用该实例运行测试：

```sh
CRASH_PAD_REUSE_SERVER=1 npm run test:browser
```

使用本机 Chrome 的示例：

```sh
CRASH_PAD_REUSE_SERVER=1 \
CRASH_PAD_BROWSER='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
npm run test:browser
```

构建产物位于 `dist/`，可部署到静态托管服务。要在本地预览构建产物，请先停止占用 `5173` 的开发服务，再运行：

```sh
npm run preview
```

自动化测试使用浏览器设备模拟；真实 iPhone、Android 和内置浏览器的文件保存体验仍需实机验证。

## 技术结构

```text
src/
├── App.jsx                 # 工作台与对象选择
├── components/             # 道路、车辆、信号灯属性、画布与导出面板
├── hooks/useEditor.js      # 草稿、历史和分组编辑
├── hooks/useReplay.js      # 演示时间轴与播放状态
├── model.js                # 场景校验、路线几何和历史模型
├── traffic/                # 独立车流模拟引擎、路段拼接、统计与对照 Worker
├── roads.js                # 参数化道路模板
├── scene.js                # 编辑、预览和导出共用的 SVG 场景
├── socialExport.js         # 小红书 / 抖音竖版排版
├── export.js               # 图片比例适配与 PNG / JPG 下载
├── gifExport.js            # GIF 逐帧渲染、进度与取消
├── gif.worker.js           # GIF 编码 Worker
└── style.css               # 工作台与移动端样式
```

主要依赖：React、Vite、gifenc；自动化测试使用 Node.js Test Runner 和 Playwright。

## 更新 README 截图

先启动或复用本项目的开发服务，再执行：

```sh
node scripts/capture-readme.mjs
```

使用本机 Chrome：

```sh
CRASH_PAD_BROWSER='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/capture-readme.mjs
```

脚本使用隔离的虚构演示草稿，不读取或覆盖当前浏览器的现场数据。输出位于 `docs/images/`，包括桌面工作台、信号灯属性、导出预览及移动端界面。默认复用 `http://127.0.0.1:5173`，可通过 `CRASH_PAD_URL` 指定地址；脚本不会启动或停止开发服务。

多参与者界面截图由 `tests/browser/participants.spec.js` 生成，保存在 `test-results/`。需要更新 README 展示图时，将桌面项目的 `participants.png` 复制到 `docs/images/participants.png`。

## 车流模拟验证

`tests/traffic.test.js` 检查路段衔接、种子复现、车辆守恒、非负速度、变道占位与车辆间距，以及左右收窄与多车道连续汇入。`tests/browser/traffic.spec.js` 覆盖模块切换、草稿隔离、暂停/重置、方案对照和手机布局。

车流模块使用 hash 入口 `/#/traffic`，无需服务端重写规则。UI 与对照 Worker 按需加载，原现场还原页面不启动模拟任务。实时运行固定步长 0.1 秒；对照 Worker 使用同一个 `engine.js`，避免实时与批处理使用两套规则。

模型、参数和统计口径见[车流实验室说明](traffic.md)。

车流模块的运行中画面与方案对照截图可使用 `node scripts/capture-traffic.mjs` 更新。它同样复用现有服务，使用隔离的虚构设置，不会覆盖用户浏览器中的数据。


## 自由路网内核

`src/traffic/network/` 提供配置 / 几何 / 路线编译、确定性模拟、编辑界面与后台方案对照。`src/traffic/simulation.worker.js` 为线性道路和自由路网共用的实时运行入口。Worker 协议为 `init/run/pause/rate/reset`，快照与错误携带 `taskId`；旧任务结果由客户端丢弃，离开模块终止 Worker。

新增路网单元测试覆盖轨迹衔接、方向限制、冲突互斥、红绿灯、出口堵塞、掉头、弯道、车辆守恒与种子复现；浏览器测试为 `tests/browser/network.spec.js`。其中桌面性能用例验证 300 车、5×、8 秒运行期间的时钟偏差与暂停响应，测量结果输出为 `NETWORK_BENCHMARK`，手机跳过该桌面性能目标。它是当前测试设备的响应检查，不代表所有设备的性能保证。

新路网使用 `crashpad:network:v1` 保存配置和 A/B，保留旧交通与事故存储键。两类交通场景可在界面切换，未进行强制数据迁移。

本机 Chrome、1440×1100、300 车、5×、持续 8 秒的验证记录（2026-10-16）：按墙钟折算的模拟时钟偏差约 27 ms，暂停到界面更新约 2.9 ms；性能用例门槛分别为 500 ms 与 200 ms。


## 统一画布与旧实验兼容

`/#/traffic` 与 `/#/traffic/network` 现在挂载同一个编辑器；`/#/traffic/legacy` 仅用于历史兼容与回归，不在主界面提供模式切换。统一编辑器将道路模板转为同一份图模型，`templates.js` 负责模板插入及旧配置转换；`facilities.js` 将一个收费站展开为进站分流、窗口车道与出站汇流，画布仍作为一个对象编辑。

单向道路仅产生一个方向的运行边，普通道路最多每方向 6 车道，收费站内部最多 12 个窗口车道。收窄连接使用共同出口的纵向坐标维护跨轨迹安全间距；真正的交叉冲突仍由路口占用控制。

统一编辑历史保留当前页面的 60 个配置快照，撤销、重做与导入都会重置当前模拟；不会修改旧 `crashpad:traffic:v1`。没有新草稿时尝试从旧草稿和 A/B 转换，有新草稿时显式导入单个旧方案。转换后的路线距离和耗时不宣称与旧引擎等价。

新增 `tests/unified-traffic.test.js` 与 `tests/browser/unified-traffic.spec.js` 覆盖模板插入、连续汇流、收费窗口、支路流量、历史和数据兼容。`capture-traffic.mjs` 保留捕获旧兼容界面的用途。

合并后桌面基准复查：300 辆、5×、持续 8 秒，按墙钟折算的时钟偏差约 11 ms，暂停更新约 3.9 ms；仍仅代表当前本机 Chrome 环境。暂停时丢弃在途快照，恢复时从 Worker 的固定步长状态继续，避免暂停后统计再跳动。
