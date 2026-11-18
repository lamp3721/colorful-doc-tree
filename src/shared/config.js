/**
 * 配置模型 + 持久化（插件版 shared 层）
 * 状态唯一权威源：cfg 对象（内存），kernel plugin data 落盘（config.json）。
 * 迁移：v0.1 时代 override 值可能是纯数字（色相）——读取时归一化为 {h}。
 * 防抖 1500ms（saveData 会广播 data change，密集落盘曾引发插件重载闪烁，
 * 见 main.js onDataChanged 覆写）。
 */
export const DEFAULTS = { enabled: true, alpha: 0.14, chroma: 0.12, light: 62, style: "block", tree: true };
export const CFG_KEY = "config.json";

export const cfg = Object.assign({}, DEFAULTS);
if (typeof cfg.overrides !== "object" || cfg.overrides === null) cfg.overrides = {};

let host = null;   // saveData 宿主（Plugin 实例注入，避免本层依赖 siyuan API）
export function bindHost(plugin) { host = plugin; }

export async function loadCfg() {
    if (!host) return;
    try {
        const saved = await host.loadData(CFG_KEY);
        if (saved && typeof saved === "object") deepMerge(cfg, saved);
    } catch (e) { console.error("[cftree] 配置读取失败:", e); }
    // 迁移归一化
    for (const k of Object.keys(cfg.overrides || {})) {
        const o = cfg.overrides[k];
        if (typeof o === "number") cfg.overrides[k] = { h: o };
    }
}

function deepMerge(target, src) {
    for (const k of Object.keys(src)) {
        if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k]) &&
            target[k] && typeof target[k] === "object") deepMerge(target[k], src[k]);
        else target[k] = src[k];
    }
}

export function persist() { if (host) host.saveData(CFG_KEY, cfg); }

let saveTimer = 0;
export function persistSoon() {
    // 1500ms 防抖：拖滑条连续落盘会连发 data change（onDataChanged 已覆写
    // 免重载，这里再把频率砍稀——双保险）
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 1500);
}
export function flushCfg() { clearTimeout(saveTimer); persist(); }
