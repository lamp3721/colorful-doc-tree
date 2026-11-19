/**
 * 彩色文档树 — 插件入口（源码 src/*.js，构建产物 ../index.js）
 * 结构（镜像主题 JS 的组件化范式，适配插件形态）：
 *   main.js          装配入口：Plugin 类 + 生命周期（唯一根级文件）
 *   shared/          共享层：config（配置+持久化）/ color（色彩数学）
 *   walker/          组件：文档树走查（观察+状态写入）
 *   render/          组件：样式渲染（CSS 公式+dataset 状态）
 *   settings/        组件：设置面板
 * 生命周期顺序：onload = bindHost → loadCfg → applyStyle → buildSetting
 *   → 命令注册 → startWatchers；onunload 逆序。
 * 依赖单向无环：main → settings → render/walker → shared。
 */
const siyuan = require("siyuan");
import { cfg, bindHost, loadCfg, persist, flushCfg } from './shared/config.js';
import { applyStyle, removeStyle, toggle as toggleStyle } from './render/index.js';
import { startWatchers, stopWatchers, clearMarks } from './walker/index.js';
import { buildSetting } from './settings/index.js';

class ColorfulDocTree extends siyuan.Plugin {
    constructor(options) {
        super(options);
        this._cfgDialog = null;
        this._cfgContainer = null;
    }

    async onload() {
        bindHost(this);
        await loadCfg();
        applyStyle();
        // 双保险首扫（v0.7.1）：正常路径在 onLayoutReady（桌面启动流程调），
        // 但移动端 afterLayoutReady 挂在"我的"菜单首开（mobile/menu/index.ts:124）
        // ——用户不点菜单走查就永远不启动。onload 直接扫一次：面板已在（移动端
        // 面板常驻 index.tpl:41）立即染上；面板未建靠 watchers 追补。幂等无代价
        if (cfg.enabled) startWatchers();
        // 命令注册：ICommand 字段是 langKey/langText（command 字段无人识别
        // → ID 落 undefined → 撞 ID → onload 崩，v0.4.17 真机实证，勿回退）
        const L = this.i18n || {};
        this.addCommand({ langKey: "toggle", langText: L.toggle || "切换彩色背景", hotkey: "", callback: () => this.toggle() });
        this.addCommand({ langKey: "settings", langText: L.settings || "彩色文档树设置", hotkey: "", callback: () => this.openSettings() });
        // this.setting 存在 = 集市列表齿轮图标（hasPluginSetting 判定）；
        // 面板内容由 settings 组件构建
        this.setting = buildSetting(siyuan, this.i18n);
    }

    // 布局就绪再启动走查（v0.5.3 修"刷新界面颜色迟到数秒"）：面板已在 DOM，
    // scan(true) 一次到位；官方插件生命周期专用钩子（lifecycle.ts runLayout）
    onLayoutReady() {
        if (cfg.enabled) startWatchers();
    }

    // 覆写即免重载（plugin/lifecycle.ts:469——未覆写时 saveData 的 data change
    // 任务原位提升为整插件 reload；本实例内存 cfg 即权威）
    onDataChanged() {}

    onunload() {
        flushCfg();
        this._cfgDialog = null;
        this._cfgContainer = null;
        stopWatchers();
        clearMarks();
        removeStyle();
    }

    toggle() {
        const on = toggleStyle();
        if (on) startWatchers();
        else { stopWatchers(); clearMarks(); }
        return on;
    }

    openSettings() {
        if (this.setting) this.setting.open(this.displayName || this.name);
    }
}

module.exports = ColorfulDocTree;
