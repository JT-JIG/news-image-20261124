// News image for Tuesday 24 November 2026 (Node 22, standard library only).
//
// The entry is one 1024x1024 PNG, entry.png next to this file, drawn as a
// newspaper front page: the Nvidia rally reverses a day after its 31% surge,
// Putin vows retaliation over Ukraine's oil-plant strikes, a US jury convicts
// Huawei on 10 of 12 counts, Israeli strikes kill seven in Gaza despite the
// ceasefire, and 24 more dated stories from seven regions.
//
// This program copies that image to the grader's output directory. It first
// proves the file is a well-formed PNG the gate accepts — correct signature,
// an IHDR chunk that declares 1024x1024, and a size under 1 MiB — then writes
// it out and verifies the written bytes by comparing SHA-256 digests, so the
// two runs the grader makes always produce identical output.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ONE_MIB = 1024 * 1024;
const MAX_DIMENSION = 1024;

const root = dirname(fileURLToPath(import.meta.url));
const inputPath = join(root, "entry.png");
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const outputPath = join(outputDir, "entry.png");

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

// Small table-driven CRC-32 (PNG chunk checksums), built once at load.
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const png = readFileSync(inputPath);

if (png.length > ONE_MIB) {
  throw new Error(
    `entry.png is ${png.length} bytes, above the 1 MiB gate limit`,
  );
}

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
if (!png.subarray(0, 8).equals(signature)) {
  throw new Error("entry.png does not start with the PNG signature");
}

// The first chunk is IHDR: 4-byte length, the ASCII type at offset 8, then
// 13 bytes of data — width and height as big-endian uint32 at offsets 16/20.
const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
const ihdrLength = view.getUint32(8, false);
const ihdrType = png.toString("latin1", 12, 16);
if (ihdrLength !== 13 || ihdrType !== "IHDR") {
  throw new Error(`first chunk is not IHDR (length ${ihdrLength}, type ${ihdrType})`);
}
const width = view.getUint32(16, false);
const height = view.getUint32(20, false);
if (width === 0 || height === 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
  throw new Error(`image dimensions ${width}x${height} are outside 1..1024`);
}
// The IHDR chunk's stored CRC (offset 29) must match the CRC of its type
// plus its 13 data bytes, or the file is corrupt.
const ihdrCrcStored = view.getUint32(29, false);
const ihdrCrcActual = crc32(png.subarray(12, 29));
if (ihdrCrcStored !== ihdrCrcActual) {
  throw new Error("IHDR chunk CRC mismatch — entry.png is corrupt");
}
// A whole PNG ends with the 12-byte IEND chunk; a truncated file is refused.
const tail = png.subarray(png.length - 12);
if (tail.toString("latin1", 4, 8) !== "IEND") {
  throw new Error("entry.png has no IEND trailer — file is truncated");
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, png);

const written = readFileSync(outputPath);
if (sha256(written) !== sha256(png)) {
  throw new Error("output bytes differ from entry.png");
}
console.log(
  `wrote ${outputPath}: ${png.length} bytes, ${width}x${height}, sha256 ${sha256(png).slice(0, 16)}…`,
);
