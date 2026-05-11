# C++ Web IDE (静态版)

纯静态 HTML + CSS + JS，无构建流程。运行依赖已本地打包到 `vendor/`。

## 目录结构

- `index.html` 页面入口
- `styles.css` 样式
- `app.js` UI 逻辑
- `runner.js` 执行逻辑
- `worker.js` Web Worker
- `vendor/` 本地依赖打包产物

## 使用 Docker

```sh
docker compose up
```

默认端口 `3000`，浏览器打开 `http://localhost:3000`。

## 功能说明

- C++98/03 解释执行（JSCPP）
- 预输入（支持 `cin`）
- 错误中文摘要 + 行列定位（若 JSCPP 提供）
- 超时保护（默认 3000ms）
- 本地自动保存（localStorage）

## 工程细节

- Worker 隔离执行，主线程负责 UI 渲染与状态更新
- 输出长度限制避免卡顿，超过上限自动截断
- 解析错误自动提取行列号并输出中文摘要
- 本地保存采用轻量节流，降低频繁写入成本
- 依赖已打包到 `vendor/`，保证离线可用

## 注意

- 请通过 HTTP 访问（不要用 `file://`），否则 Worker 无法加载。
- `vendor/` 为离线依赖包，当前已固定版本。
