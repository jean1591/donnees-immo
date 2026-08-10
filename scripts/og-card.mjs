// Renders public/og.png, the single social card every page points at.
//
// Run locally, alongside the ETL — the card states the commune count, so it
// goes stale on the same schedule as the data and is regenerated the same way:
//
//   npm run export && npm run og
//
// Chrome rather than a rasteriser library: the card is a page, laid out in the
// same system-ui the site uses, and Chrome is already on the machine. Nothing
// here runs at build time, so the deploy keeps its single dependency on Astro.

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))

// Facebook, LinkedIn, Slack and X all crop to 1.91:1. 1200x630 is that ratio at
// the largest size every one of them accepts without re-encoding.
const WIDTH = 1200
const HEIGHT = 630

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const { DATASET } = await import(new URL('../src/lib/dataset.js', import.meta.url))
const communes = JSON.parse(await readFile(join(root, 'data/communes.json'), 'utf8'))

const count = new Intl.NumberFormat('fr-FR').format(communes.length)

// Inlined rather than imported from global.css: that file is Tailwind's entry
// point, not a plain stylesheet, and the card needs six colour values.
const html = `<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    display: flex;
    flex-direction: column;
    padding: 72px;
    background: #faf5ec;
    color: #1c1815;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-synthesis: none;
  }
  .rule { position: fixed; inset: 0 0 auto 0; height: 10px; background: linear-gradient(90deg, #e2913f, #cf6a26); }
  .mark { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; }
  .mark span { color: #cf6a26; }
  /* 20ch breaks the headline over two lines rather than three, so it spans the
     frame instead of stacking in a narrow left column against dead space. */
  h1 { margin-top: 44px; font-size: 72px; font-weight: 600; letter-spacing: -0.03em; line-height: 1.1; max-width: 20ch; }
  .lede { margin-top: 30px; font-size: 30px; line-height: 1.4; color: #5a5249; max-width: 42ch; }
  .lede b { font-weight: 600; color: #1c1815; }
  footer { margin-top: auto; padding-top: 28px; border-top: 1px solid #e8e0d2; display: flex; align-items: baseline; justify-content: space-between; font-size: 20px; color: #8b8175; }
  .types { display: flex; gap: 28px; }
  .type { display: flex; align-items: baseline; gap: 10px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; transform: translateY(-1px); }
</style>
<div class="rule"></div>
<div class="mark">donnees-immo<span>.fr</span></div>

<h1>Prix immobilier, commune par commune</h1>
<p class="lede"><b>${count} communes</b>, au prix des ventes enregistrées. Pas des estimations&nbsp;: des actes signés.</p>

<footer>
  <div class="types">
    <span class="type"><span class="dot" style="background:#cf6a26"></span>Appartements</span>
    <span class="type"><span class="dot" style="background:#2a6fb0"></span>Maisons</span>
  </div>
  <div>DVF · DGFiP — ${DATASET.firstYear}-${DATASET.lastYear}</div>
</footer>
</html>
`

const scratch = await mkdtemp(join(tmpdir(), 'og-card-'))
const page = join(scratch, 'card.html')
const out = join(root, 'public/og.png')
await writeFile(page, html)

await run(CHROME, [
  '--headless',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--window-size=${WIDTH},${HEIGHT}`,
  `--screenshot=${out}`,
  `file://${page}`,
])

const { size } = await import('node:fs').then((fs) => fs.promises.stat(out))
console.log(`public/og.png — ${WIDTH}x${HEIGHT}, ${(size / 1024).toFixed(1)} kB, ${count} communes`)
