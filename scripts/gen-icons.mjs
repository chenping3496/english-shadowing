// 生成 PWA 图标（无第三方依赖，纯 zlib + 手写 PNG 编码）
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// —— PNG 编码 ——
let table;
function crc32(buf) {
  if (!table) {
    table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, c]);
}
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// —— 绘制 ——
const BG = [13, 11, 9]; // #0d0b09
const AMBER = [255, 140, 66]; // #ff8c42
const AMBER_STRONG = [255, 106, 30]; // #ff6a1e

function drawIcon(size, { rounded = true } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const set = (x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = a;
  };
  const radius = rounded ? size * 0.22 : 0;
  const cx = Math.min(Math.max(0.5, radius), size - radius);
  const inRound = (x, y) => {
    if (!rounded) return true;
    const px = Math.min(Math.max(x + 0.5, radius), size - radius);
    const py = Math.min(Math.max(y + 0.5, radius), size - radius);
    const dx = x + 0.5 - px, dy = y + 0.5 - py;
    return dx * dx + dy * dy <= radius * radius;
  };

  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) if (inRound(x, y)) set(x, y, BG, 255);

  // 波形条（7 根，中间高两边低）
  const barCount = 7;
  const barWidth = size * 0.055;
  const gap = size * 0.028;
  const totalW = barCount * barWidth + (barCount - 1) * gap;
  const startX = (size - totalW) / 2;
  const centerY = size / 2;
  const heights = [0.24, 0.48, 0.74, 0.42, 0.92, 0.58, 0.3];
  for (let b = 0; b < barCount; b++) {
    const h = heights[b] * size * 0.72;
    const x0 = startX + b * (barWidth + gap);
    const y0 = centerY - h / 2;
    const col = b === 4 ? AMBER_STRONG : AMBER;
    for (let y = Math.floor(y0); y < y0 + h; y++)
      for (let x = Math.floor(x0); x < x0 + barWidth; x++) set(x, y, col, 255);
  }
  return rgba;
}

function out(rel, size, opts) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, encodePng(size, size, drawIcon(size, opts)));
  console.log("wrote", rel);
}

out("public/icon-192.png", 192);
out("public/icon-512.png", 512);
out("src/app/icon.png", 512);
out("src/app/apple-icon.png", 180, { rounded: false });
