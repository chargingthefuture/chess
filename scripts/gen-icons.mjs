// Generates the PWA icons (committed under public/) with zero image dependencies:
// a centered chessboard motif on a dark background. Run with `node scripts/gen-icons.mjs`.
//
// The icons are committed, so you only need to re-run this if you change the artwork.
import { deflateSync, crc32 } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '..', 'public')

const BG = [17, 24, 39] // #111827 slate
const DARK = [118, 150, 86] // #769656 board dark
const LIGHT = [238, 238, 210] // #eeeed2 board light
const FRAME = [40, 54, 24] // dark green frame

/** Build a getPixel(x,y)->[r,g,b] for a centered 8x8 board with `pad` fraction of margin. */
function boardPainter(size, pad) {
  const margin = Math.round(size * pad)
  const board = size - margin * 2
  const sq = board / 8
  const fw = Math.max(1, Math.round(size * 0.014))
  return (x, y) => {
    const bx = x - margin
    const by = y - margin
    if (bx < 0 || by < 0 || bx >= board || by >= board) return BG
    if (bx < fw || by < fw || bx >= board - fw || by >= board - fw) return FRAME
    const col = Math.floor(bx / sq)
    const row = Math.floor(by / sq)
    return (row + col) % 2 === 0 ? LIGHT : DARK
  }
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0, 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(size, getPixel) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  const raw = Buffer.alloc((size * 3 + 1) * size)
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = getPixel(x, y)
      raw[o++] = r
      raw[o++] = g
      raw[o++] = b
    }
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))])
}

mkdirSync(publicDir, { recursive: true })
const outputs = [
  ['pwa-192x192.png', 192, 0.06],
  ['pwa-512x512.png', 512, 0.06],
  // Maskable needs more padding so the board survives the platform's safe-zone crop.
  ['pwa-maskable-512x512.png', 512, 0.14],
  ['apple-touch-icon.png', 180, 0.07],
]
for (const [name, size, pad] of outputs) {
  writeFileSync(resolve(publicDir, name), encodePng(size, boardPainter(size, pad)))
  console.log(`[gen-icons] public/${name} (${size}x${size})`)
}
