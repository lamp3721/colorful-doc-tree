/**
 * 色彩数学（纯函数层）
 * 哈希 → 20 档色相调色板；HSL ↔ HEX 换算（设置面板色板用）。
 * 暗色纪律：色相只进 OKLCH 公式（亮度/饱和由 CSS 固定），多色不荧光。
 */
// 20 档调色板（v0.6.10 加密：原 10 档下 10 本笔记撞色率约 40%（生日悖论），
// 20 档降到个位数百分比，超 10 本仍有富余。间距 18°，仍避开暗底浑浊区
export const HUES = [12, 30, 48, 66, 84, 102, 120, 138, 156, 174, 192, 210, 228, 246, 264, 282, 300, 318, 336, 354];
// 名称表（v0.7.4 全 20 档）：20 桶 20 色全列可选
export const HUE_NAMES = {
    12: "橙", 30: "橙黄", 48: "黄", 66: "黄绿", 84: "草绿",
    102: "绿", 120: "深绿", 138: "墨绿", 156: "青绿", 174: "青",
    192: "天青", 210: "蔚蓝", 228: "蓝", 246: "品蓝", 264: "靛",
    282: "蓝紫", 300: "紫", 318: "绛紫", 336: "玫红", 354: "品红",
};

// djb2 + fmix32 雪崩（直取 mod 混合不足）；位运算产带符号数，取模前归无符号
export function hashHue(key) {
    let h = 5381;
    for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
    h ^= h >>> 16; h = (h * 0x7feb352d) >>> 0;
    h ^= h >>> 15; h = (h * 0x846ca68b) >>> 0;
    h ^= h >>> 16;
    return HUES[(h >>> 0) % HUES.length];
}

export function hslToHex(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h / 30) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, "0"); };
    return "#" + f(0) + f(8) + f(4);
}

export function hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn) {
        const d = mx - mn;
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
        else if (mx === g) h = ((b - r) / d + 2);
        else h = ((r - g) / d + 4);
        h *= 60;
    }
    return { h: h < 0 ? h + 360 : h, ss: s, ll: l };
}
