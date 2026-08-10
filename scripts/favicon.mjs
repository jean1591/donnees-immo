// Renders public/favicon.ico from public/favicon.svg.
//
//   npm run favicon
//
// The SVG stays the source of truth and the one browsers actually use. The .ico
// exists because /favicon.ico is requested blind, without reading the HTML, by
// every browser and by a good share of the crawlers that hit this site — those
// requests were 404ing. Run it again only if favicon.svg changes.
//
// The three frames are PNGs wrapped in an ICO container, which every browser
// since Vista reads. A BMP-encoded ICO would buy compatibility with parsers
// that predate that, and cost an encoder for icons nothing renders any more.

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// 16 for tab strips and legacy Windows chrome, 32 for retina tabs and the
// Google favicon service, 48 for bookmark and shortcut surfaces.
const SIZES = [16, 32, 48]

const svg = await readFile(join(root, 'public/favicon.svg'), 'utf8')
const scratch = await mkdtemp(join(tmpdir(), 'favicon-'))

const frames = []
for (const size of SIZES) {
  // The page background stays transparent so the rounded corners of the SVG
  // are not filled in with white.
  const page = join(scratch, `${size}.html`)
  const png = join(scratch, `${size}.png`)
  await writeFile(
    page,
    `<!doctype html><meta charset="utf-8">
     <style>*{margin:0}html,body{width:${size}px;height:${size}px;background:transparent}
     svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
  )
  await run(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${png}`,
    `file://${page}`,
  ])
  frames.push({ size, data: await readFile(png) })
}

// ICONDIR: 6 bytes, then one 16-byte ICONDIRENTRY per frame, then the payloads.
const HEADER = 6
const ENTRY = 16
const dir = Buffer.alloc(HEADER + ENTRY * frames.length)
dir.writeUInt16LE(0, 0) // reserved
dir.writeUInt16LE(1, 2) // 1 = icon
dir.writeUInt16LE(frames.length, 4)

let offset = dir.length
frames.forEach((frame, index) => {
  const at = HEADER + ENTRY * index
  // 256 is stored as 0 in a single byte; none of our sizes reach it, but the
  // modulo keeps that true if one is ever added.
  dir.writeUInt8(frame.size % 256, at)
  dir.writeUInt8(frame.size % 256, at + 1)
  dir.writeUInt8(0, at + 2) // palette size, 0 for truecolour
  dir.writeUInt8(0, at + 3) // reserved
  dir.writeUInt16LE(1, at + 4) // colour planes
  dir.writeUInt16LE(32, at + 6) // bits per pixel
  dir.writeUInt32LE(frame.data.length, at + 8)
  dir.writeUInt32LE(offset, at + 12)
  offset += frame.data.length
})

const out = join(root, 'public/favicon.ico')
await writeFile(out, Buffer.concat([dir, ...frames.map((f) => f.data)]))

console.log(
  `public/favicon.ico — ${frames.map((f) => `${f.size}x${f.size}`).join(', ')}, ${(offset / 1024).toFixed(1)} kB`
)
