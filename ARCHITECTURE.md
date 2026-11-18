# 彩色文档树 · 源码结构

> 镜像 Drake Vue3 主题 JS 的组件化范式（一组件一文件夹 + shared 层），适配插件形态。

```
src/
├── main.js           入口：Plugin 类 + 生命周期装配（唯一根级文件）
│                       onload = bindHost→loadCfg→applyStyle→命令注册→buildSetting→startWatchers
│                       onunload 逆序（flushCfg→stopWatchers→clearMarks→removeStyle）
├── shared/           共享层（纯数据/纯函数，无 DOM 副作用）
│   ├── config.js     配置模型：cfg 单例 + kernel data 持久化 + 迁移 + 防抖
│   └── color.js      色彩数学：hashHue/HUES/HUE_NAMES/hsl↔hex
├── walker/           组件：文档树走查（面板观察/发现/状态写入）
│                       走查窗口防回环；键 = notebook:<id> 剥前缀
├── render/           组件：样式渲染（CSS 公式生成 + dataset 状态 + <style> 注入）
└── settings/         组件：设置面板（官方 Setting + 折叠分组 + 自定义色参数区）
```

## 构建与产物

`npm run build` → esbuild bundle `src/main.js` → **根目录 index.js**（CJS，
`siyuan` external 运行时注入）。思源/集市加载的始终是这个单文件产物，
模块结构对运行时零感知。改源码后必须 build（勿手改产物，banner 有声明）。

## 依赖方向（单向无环）

main → settings → render / walker → shared

## 组件契约

- walker：`startWatchers / stopWatchers / clearMarks / walkAllNow`（walkAllNow 供设置层改 override 后即时重走查）
- render：`applyStyle / removeStyle / toggle`
- settings：`buildSetting(siyuan, i18n) → Setting 实例`
- shared/config：`cfg（状态）/ loadCfg / persist / persistSoon / flushCfg / bindHost`
