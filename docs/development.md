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
