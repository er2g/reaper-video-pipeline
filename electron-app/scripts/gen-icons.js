/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const icoPath = path.join(buildDir, 'icon.ico');
const pngPath = path.join(buildDir, 'icon.png');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Minimal CRC32 for PNG chunks
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = u32be(data.length);
  const crc = u32be(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function writePngIcon(targetPath, size = 512) {
  const width = size;
  const height = size;

  const bg = { r: 18, g: 18, b: 22, a: 255 };
  const fg = { r: 0, g: 200, b: 255, a: 255 };

  const raw = Buffer.alloc((width * 4 + 1) * height);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const r = Math.min(width, height) * 0.44;
  const r2 = r * r;

  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const inside = (dx * dx + dy * dy) <= r2;

      const p = rowStart + 1 + x * 4;
      const c = inside ? fg : bg;
      raw[p + 0] = c.r;
      raw[p + 1] = c.g;
      raw[p + 2] = c.b;
      raw[p + 3] = c.a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const idat = zlib.deflateSync(raw, { level: 9 });

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(targetPath, png);
}

function tryGenerateIcoWindows() {
  if (process.platform !== 'win32') return;
  if (fs.existsSync(icoPath)) return;

  const ps1 = path.join(__dirname, 'gen-icon.ps1');
  if (!fs.existsSync(ps1)) {
    console.warn('Missing scripts/gen-icon.ps1, skipping ico generation');
    return;
  }

  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], {
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    throw new Error(`Icon generation failed (exit ${r.status})`);
  }
}

function main() {
  ensureDir(buildDir);

  if (!fs.existsSync(pngPath)) {
    writePngIcon(pngPath, 512);
    console.log(`Wrote ${pngPath}`);
  }

  tryGenerateIcoWindows();
}

main();

