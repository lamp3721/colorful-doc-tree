/**
 * 构建脚本：src/main.js（ES modules）→ index.js（CJS 单文件产物）
 * 思源插件直接加载 index.js（module.exports = Plugin 类），无模块系统——
 * bundle 成 CJS，require("siyuan") 保持 external（思源运行时注入）。
 * 与主题 build.js 同范式：不压缩、留注释、banner 声明勿手改。
 */
import { build as esbuild } from 'esbuild';

await esbuild({
    entryPoints: ['src/main.js'],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2017',
    minify: false,
    legalComments: 'none',
    external: ['siyuan'],
    banner: {
        js: '/** 彩色文档树 — 构建产物（源码 src/*.js，勿手改；构建：npm run build） */',
    },
    outfile: 'index.js',
});
console.log('Build complete: index.js');
