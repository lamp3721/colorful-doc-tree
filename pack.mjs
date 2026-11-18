/**
 * 本地测试打包：构建 → package.zip（手动安装用，包根直放文件）
 * 仅服务手动测试（npm run pack）；集市发布的打包在 release.yml 里独立
 * 完成（CI 多套一层 colorful-doc-tree/ 目录，集市安装器自剥）。
 * zip 用 python3 zipfile（node 无内置 zip，系统 zip 命令容器没有）。
 */
import { execSync } from 'child_process';
import { existsSync, statSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)));

// 1. 构建（产物 index.js）
execSync('node build.js', { cwd: root, stdio: 'inherit' });

// 2. 清单校验（缺文件直接失败，不带病出包）
const FILES = ['plugin.json', 'index.js', 'index.css', 'icon.png', 'preview.png', 'README.md', 'README.zh-CN.md'];
for (const f of FILES) {
    if (!existsSync(resolve(root, f))) { console.error('  ✗ 缺失:', f); process.exit(1); }
}
const i18n = readdirSync(resolve(root, 'i18n'));
if (!i18n.length) { console.error('  ✗ i18n 为空'); process.exit(1); }

// 3. zip（python3 zipfile；sh -c 保证通配符展开）
const all = [...FILES, ...i18n.map(f => 'i18n/' + f)];
execSync('rm -f package.zip && python3 -c "import sys,zipfile;' +
    'z=zipfile.ZipFile(\'package.zip\',\'w\',zipfile.ZIP_DEFLATED);' +
    '[z.write(f,f) for f in sys.argv[1:]]" ' + all.join(' '), { cwd: root, stdio: 'inherit', shell: '/bin/sh' });
console.log('Pack complete: package.zip (' + statSync(resolve(root, 'package.zip')).size + ' bytes)');
