// Notifies IndexNow that every page changed. Bing, Yandex and Seznam consume it;
// Google does not participate.
//
//   npm run build && npm run indexnow          # submit
//   npm run indexnow -- --dry-run              # print what would be sent
//
// This replaces Cloudflare's Crawler Hints, which is the same protocol behind a
// paid plan on this account. Doing it by hand costs a key file and one request.
//
// Run it after a deploy, not before: IndexNow fetches the key from the live site
// to prove you control the host, and answers 403 if it cannot find it.
//
// The site changes in one batch twice a year when the ETL is re-run, so there is
// nothing to submit incrementally — the whole list goes every time, which is
// well inside the 10 000 URL ceiling of a single request.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const KEY = 'db4c139b35105e6036da8b7d4e9e960b'
const HOST = 'donnees-immo.fr'
const ENDPOINT = 'https://api.indexnow.org/indexnow'
const MAX_URLS = 10_000

const dryRun = process.argv.includes('--dry-run')

// The built sitemap is the URL list, rather than a second walk over
// communes.json: it is the same set by construction, so the two can never
// disagree, and reading it forces a build to have happened first.
const sitemap = await readFile(join(root, 'dist/sitemap.xml'), 'utf8').catch(() => {
  console.error('dist/sitemap.xml is missing — run `npm run build` first.')
  process.exit(1)
})

const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])

if (urlList.length === 0) {
  console.error('no <loc> found in dist/sitemap.xml')
  process.exit(1)
}
if (urlList.length > MAX_URLS) {
  console.error(`${urlList.length} URLs exceeds the ${MAX_URLS} accepted in one request`)
  process.exit(1)
}

const body = {
  host: HOST,
  key: KEY,
  keyLocation: `https://${HOST}/${KEY}.txt`,
  urlList,
}

if (dryRun) {
  console.log(`${urlList.length} URLs would be submitted, first three:`)
  for (const url of urlList.slice(0, 3)) console.log(`  ${url}`)
  console.log(`key location: ${body.keyLocation}`)
  process.exit(0)
}

// The key has to be readable before submitting, so check it rather than let the
// API answer 403 with no explanation.
const live = await fetch(body.keyLocation).then((r) => (r.ok ? r.text() : null))
if (live?.trim() !== KEY) {
  console.error(`${body.keyLocation} does not serve the key — deploy before submitting.`)
  process.exit(1)
}

const response = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
})

// 200 accepted, 202 accepted with the key still being validated. Both are fine.
if (response.ok) {
  console.log(`${urlList.length} URLs submitted — HTTP ${response.status}`)
} else {
  console.error(`IndexNow refused the batch — HTTP ${response.status}`)
  console.error(await response.text())
  process.exit(1)
}
