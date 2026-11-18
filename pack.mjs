/**
 * 本地测试打包：构建 → package.zip（手动安装用，包根直放文件）
 * 仅服务手动测试（npm run pack）；集市发布的打包在 release.yml 里独立
 * 完成（CI 多套一层 colorful-doc-tree/ 目录，集市安装器自剥）。
 * v0.5.2：zip 改纯 Node 实现（原 /bin/sh + python3 是 Linux 容器环境，
 * Windows 直接 ENOENT）——用内置 zlib 手写 zip 容器（STORE 或 DEFLATE），
 * 零外部依赖、零平台差异。
 */
import { execSync } from 'child_process';
import { existsSync, statSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateRawSync } from 'zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)));

// 1. 构建（产物 index.js）
execSync('node build.js', { cwd: root, stdio: 'inherit' });

// 2. 清单校验（缺文件直接失败，不带病出包）
const FILES = ['plugin.json', 'index.js', 'index.css', 'icon.png', 'preview.png', 'README.md', 'README.zh-CN.md'];
for (const f of FILES) {
    if (!existsSync(resolve(root, f))) { console.error('  ✗ 缺失:', f); process.exit(1); }
}
const i18nFiles = readdirSync(resolve(root, 'i18n')).map(f => 'i18n/' + f);
if (!i18nFiles.length) { console.error('  ✗ i18n 为空'); process.exit(1); }

// 3. 纯 Node zip（最小 ZIP 写手：本地文件条目 + deflate 压缩）
//    结构：每个文件 [local header + data]，末尾 central directory + EOCD。
//    字段全按 PKWARE APPNOTE；时间取构建时刻。
function crc32(buf) {
    let c, table = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
const zipOne = (entries) => {
    const chunks = [], central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
    const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
    for (const [name, data] of entries) {
        const nameBuf = Buffer.from(name, 'utf8');
        const crc = crc32(data);
        const comp = deflateRawSync(data, { level: 6 });
        const useDeflate = comp.length < data.length;
        const store = useDeflate ? comp : data;
        const method = useDeflate ? 8 : 0;
        // local file header
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0);
        lh.writeUInt16LE(20, 4);            // version needed
        lh.writeUInt16LE(0x0800, 6);        // flags: UTF-8 名
        lh.writeUInt16LE(method, 8);
        lh.writeUInt16LE(dosTime, 10);
        lh.writeUInt16LE(dosDate, 12);
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(store.length, 18); // compressed size
        lh.writeUInt32LE(data.length, 22);  // uncompressed
        lh.writeUInt16LE(nameBuf.length, 26);
        lh.writeUInt16LE(0, 28);
        chunks.push(lh, nameBuf, store);
        // central directory record
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0);
        ch.writeUInt16LE(20, 4);
        ch.writeUInt16LE(20, 6);
        ch.writeUInt16LE(0x0800, 8);
        ch.writeUInt16LE(method, 10);
        ch.writeUInt16LE(dosTime, 12);
        ch.writeUInt16LE(dosDate, 14);
        ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(store.length, 20);
        ch.writeUInt32LE(data.length, 24);
        ch.writeUInt16LE(nameBuf.length, 28);
        ch.writeUInt16LE(0, 30);
        ch.writeUInt16LE(0, 32);
        ch.writeUInt16LE(0, 34);
        ch.writeUInt16LE(0, 36);
        ch.writeUInt32LE(0, 38);
        ch.writeUInt32LE(offset, 42);
        central.push(ch, nameBuf);
        offset += 30 + nameBuf.length + store.length;
    }
    const cd = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cd.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);
    return Buffer.concat([...chunks, cd, eocd]);
};

const entries = [...FILES, ...i18nFiles].map(f => [f, readFileSync(resolve(root, f))]);
rmSync(resolve(root, 'package.zip'), { force: true });
writeFileSync(resolve(root, 'package.zip'), zipOne(entries));
console.log('Pack complete: package.zip (' + statSync(resolve(root, 'package.zip')).size + ' bytes)');
