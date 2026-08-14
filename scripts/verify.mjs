#!/usr/bin/env node
// Blocking checks over dist/, to run after `npm run build`:
//
//   npm run build && npm run verify
//
// Everything here is an invariant that no page should ever break and that no
// reader would notice quickly: a duplicate <title> across 3 887 pages, a
// canonical pointing at the wrong address, a Dataset that lost its date, a page
// reachable only from the sitemap. They are cheap to assert and expensive to
// discover from Search Console three months later.
//
// Deliberately not a linter: it reads the built output, not the source, so it
// also catches what a template does under data it was not written for.

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const SITE = 'https://donnees-immo.fr'

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.')
  process.exit(1)
}

const files = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (entry.name.endsWith('.html')) files.push(path)
  }
}
walk(DIST)

const urlOf = (path) => path.slice(DIST.length).replace(/\/index\.html$/, '') || '/'
const first = (html, re) => html.match(re)?.[1] ?? null

const pages = files.map((path) => {
  const html = readFileSync(path, 'utf8')
  return {
    url: urlOf(path),
    title: first(html, /<title>([^<]*)<\/title>/),
    description: first(html, /<meta name="description" content="([^"]*)"/),
    canonical: first(html, /<link rel="canonical" href="([^"]*)"/),
    h1: (html.match(/<h1[\s>]/g) ?? []).length,
    noindex: /name="robots"[^>]*noindex/i.test(html),
    blocks: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
      (match) => match[1]
    ),
    links: [...html.matchAll(/href="(\/[^"#?]*)"/g)].map((match) => match[1]),
  }
})

// The 404 is served by the host on a miss; it is not linked, not in the
// sitemap, and its canonical points at itself by design.
const indexable = pages.filter((page) => page.url !== '/404.html')

const failures = []
const fail = (check, detail) => failures.push({ check, detail })

// --- structured data ---------------------------------------------------------

// What makes a figure citable: who published it, when it was last computed,
// what it covers, and what it is based on. A Dataset missing any of these is
// still valid JSON, which is exactly why it needs a test.
const DATASET_REQUIRED = [
  'name',
  'description',
  'license',
  'creator',
  'publisher',
  'dateModified',
  'temporalCoverage',
  'spatialCoverage',
  'isBasedOn',
  'variableMeasured',
]

let datasets = 0
let withGeo = 0

for (const page of pages) {
  for (const raw of page.blocks) {
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      fail('JSON-LD invalide', `${page.url} — ${error.message}`)
      continue
    }
    for (const node of [].concat(parsed)) {
      if (!node['@context']) fail('JSON-LD sans @context', page.url)
      if (!node['@type']) fail('JSON-LD sans @type', page.url)
      if (node['@type'] !== 'Dataset') continue
      datasets += 1
      const missing = DATASET_REQUIRED.filter((key) => node[key] === undefined)
      if (missing.length) fail('Dataset incomplet', `${page.url} — manque ${missing.join(', ')}`)
      const geo = node.spatialCoverage?.geo
      if (geo) {
        withGeo += 1
        const { latitude, longitude } = geo
        // France, overseas départements included, with room to spare. A
        // swapped pair lands outside it, which is the mistake worth catching.
        if (!(latitude >= -25 && latitude <= 52 && longitude >= -64 && longitude <= 56)) {
          fail('Coordonnées hors de France', `${page.url} — ${latitude}, ${longitude}`)
        }
      }
    }
  }
}

// --- uniqueness --------------------------------------------------------------

const duplicates = (entries) => {
  const seen = new Map()
  for (const [value, url] of entries) {
    if (value === null) continue
    seen.set(value, [...(seen.get(value) ?? []), url])
  }
  return [...seen].filter(([, urls]) => urls.length > 1)
}

for (const [title, urls] of duplicates(indexable.map((page) => [page.title, page.url]))) {
  fail('Titre en double', `"${title}" — ${urls.slice(0, 3).join(', ')}`)
}
for (const [, urls] of duplicates(indexable.map((page) => [page.description, page.url]))) {
  fail('Description en double', urls.slice(0, 3).join(', '))
}
for (const page of indexable) {
  if (!page.title) fail('Titre absent', page.url)
  if (!page.description) fail('Description absente', page.url)
  if (page.h1 !== 1) fail('H1 absent ou multiple', `${page.url} — ${page.h1}`)
  const expected = `${SITE}${page.url === '/' ? '/' : page.url}`
  if (page.canonical !== expected) {
    fail('Canonical incohérente', `${page.url} — ${page.canonical ?? 'absente'}`)
  }
}

// --- sitemap and internal links ----------------------------------------------

const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf8')
const listed = new Set(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replace(SITE, '') || '/')
)

for (const page of indexable) {
  if (page.noindex && listed.has(page.url)) {
    fail('noindex mais présente au sitemap', page.url)
  }
  if (!page.noindex && !listed.has(page.url)) {
    fail('Indexable mais absente du sitemap', page.url)
  }
}
for (const url of listed) {
  if (!pages.some((page) => page.url === url)) fail('Au sitemap sans page', url)
}

const linked = new Set()
for (const page of pages) {
  for (const href of page.links) {
    const target = href.replace(/\/$/, '') || '/'
    if (target !== page.url) linked.add(target)
  }
}
for (const page of indexable) {
  if (!linked.has(page.url)) fail('Page orpheline', page.url)
}

// --- report ------------------------------------------------------------------

const checks = [
  `${pages.length} pages`,
  `${datasets} Dataset, dont ${withGeo} avec coordonnées`,
  `${listed.size} URL au sitemap`,
]
console.log(`\nverify — ${checks.join(' · ')}`)

if (!failures.length) {
  console.log('  Tout est vert.\n')
  process.exit(0)
}

const byCheck = new Map()
for (const { check, detail } of failures) {
  byCheck.set(check, [...(byCheck.get(check) ?? []), detail])
}
console.log(`\n  ${failures.length} problème(s) :`)
for (const [check, details] of byCheck) {
  console.log(`\n  ${check} (${details.length})`)
  for (const detail of details.slice(0, 5)) console.log(`    - ${detail}`)
  if (details.length > 5) console.log(`    … et ${details.length - 5} de plus`)
}
console.log()
process.exit(1)
