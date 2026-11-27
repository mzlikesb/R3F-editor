#!/usr/bin/env node
// Halves a Radiance RGBE (.hdr) image with a 2x2 linear average. No dependencies.
// Usage: node scripts/hdr-downscale.mjs <in.hdr> <out.hdr>
import { readFileSync, writeFileSync } from 'node:fs';

function parse(buf) {
  let pos = 0;
  const line = () => {
    const start = pos;
    while (pos < buf.length && buf[pos] !== 0x0a) pos++;
    return buf.toString('latin1', start, pos++);
  };
  if (!line().startsWith('#?')) throw new Error('not a Radiance HDR');
  while (line() !== '') {
    /* header */
  }
  const m = /^-Y (\d+) \+X (\d+)$/.exec(line());
  if (!m) throw new Error('unsupported resolution line');
  const h = Number(m[1]);
  const w = Number(m[2]);
  const rgbe = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    if (w >= 8 && w < 32768 && buf[pos] === 2 && buf[pos + 1] === 2 && (buf[pos + 2] & 0x80) === 0) {
      if (((buf[pos + 2] << 8) | buf[pos + 3]) !== w) throw new Error('bad scanline width');
      pos += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < w) {
          let n = buf[pos++];
          if (n > 128) {
            n -= 128;
            const v = buf[pos++];
            while (n-- > 0) rgbe[row + x++ * 4 + c] = v;
          } else {
            while (n-- > 0) rgbe[row + x++ * 4 + c] = buf[pos++];
          }
        }
      }
    } else {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 4; c++) rgbe[row + x * 4 + c] = buf[pos++];
      }
    }
  }
  return { w, h, rgbe };
}

function toFloat(rgbe, i, out) {
  const e = rgbe[i + 3];
  if (e === 0) {
    out[0] = out[1] = out[2] = 0;
    return;
  }
  const f = Math.pow(2, e - 136);
  out[0] = rgbe[i] * f;
  out[1] = rgbe[i + 1] * f;
  out[2] = rgbe[i + 2] * f;
}

function toRgbe(r, g, b, dst, i) {
  const max = Math.max(r, g, b);
  if (max < 1e-32) {
    dst[i] = dst[i + 1] = dst[i + 2] = dst[i + 3] = 0;
    return;
  }
  const e = Math.floor(Math.log2(max)) + 1; // max = m * 2^e, m in [0.5, 1)
  const scale = 256 / Math.pow(2, e);
  dst[i] = Math.min(255, Math.round(r * scale));
  dst[i + 1] = Math.min(255, Math.round(g * scale));
  dst[i + 2] = Math.min(255, Math.round(b * scale));
  dst[i + 3] = e + 128;
}

function halve({ w, h, rgbe }) {
  const nw = w >> 1;
  const nh = h >> 1;
  const out = new Uint8Array(nw * nh * 4);
  const px = [0, 0, 0];
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        toFloat(rgbe, ((y * 2 + dy) * w + x * 2 + dx) * 4, px);
        r += px[0];
        g += px[1];
        b += px[2];
      }
      toRgbe(r / 4, g / 4, b / 4, out, (y * nw + x) * 4);
    }
  }
  return { w: nw, h: nh, rgbe: out };
}

// New-style RLE per scanline.
function encode({ w, h, rgbe }) {
  const parts = [Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`, 'latin1')];
  for (let y = 0; y < h; y++) {
    const bytes = [2, 2, w >> 8, w & 255];
    for (let c = 0; c < 4; c++) {
      let x = 0;
      while (x < w) {
        const v = rgbe[(y * w + x) * 4 + c];
        let run = 1;
        while (x + run < w && run < 127 && rgbe[(y * w + x + run) * 4 + c] === v) run++;
        if (run >= 3) {
          bytes.push(128 + run, v);
          x += run;
          continue;
        }
        const start = x;
        const lit = [];
        while (x < w && lit.length < 128) {
          const cur = rgbe[(y * w + x) * 4 + c];
          if (x + 2 < w && rgbe[(y * w + x + 1) * 4 + c] === cur && rgbe[(y * w + x + 2) * 4 + c] === cur) {
            break;
          }
          lit.push(cur);
          x++;
        }
        if (x === start) {
          lit.push(v);
          x++;
        }
        bytes.push(lit.length, ...lit);
      }
    }
    parts.push(Buffer.from(bytes));
  }
  return Buffer.concat(parts);
}

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: hdr-downscale.mjs <in.hdr> <out.hdr>');
  process.exit(2);
}
const img = parse(readFileSync(inPath));
const small = halve(img);
writeFileSync(outPath, encode(small));
console.log(`${img.w}x${img.h} -> ${small.w}x${small.h}`);
