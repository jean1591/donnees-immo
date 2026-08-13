#!/usr/bin/env node
// Reads the aggregate tables from etl/dvf.db and writes data/communes.json.
// Local only, twice a year, after 03-aggregate.sql.
//
//   node etl/export.mjs
//
// Side effects: writes data/communes.json and, when new slug collisions show
// up, extends data/homonymes.json (never rewritten from scratch).

import { DuckDBInstance } from '@duckdb/node-api'
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB = join(ROOT, 'etl', 'dvf.db')
const DEPARTMENTS_FILE = join(ROOT, 'data', 'departements.json')
const HOMONYMS_FILE = join(ROOT, 'data', 'homonymes.json')
const OUT = join(ROOT, 'data', 'communes.json')

// Publication threshold: below this the margin of error on the median exceeds
// 10 % (see CLAUDE.md). A commune is kept on its best-selling type, but each
// type block is published under the same rule.
const MIN_SALES = 50

/**
 * Sales a room-count cell needs over the 24-month window before its own
 * five-year series is carried into the JSON.
 *
 * A room-count cell holds roughly a fifth of a commune's sales, so the yearly
 * split of one lands an order of magnitude below the commune total: shipping all
 * 72 514 rows of agg_pieces_annuel would add several megabytes to a file the
 * build already reads whole, for series nothing can publish. At 100 the export
 * carries about 2 000 cells — every one that could ever back a figure.
 *
 * Deliberately looser than what the site actually publishes: the ETL runs twice
 * a year against a database that is not deployed, the site rebuilds whenever,
 * and widening the page selection must not require the former.
 */
const MIN_ROOM_SERIES_SALES = 100

// INSEE codes of the three cities rebuilt from their arrondissements.
const CITY_CODES = new Set(['75056', '69123', '13055'])

// Who gets the bare slug when several communes claim it. The value is either a
// department code, or an INSEE code when the candidates share a department.
// These are frozen into data/homonymes.json on first run: changing them after
// indexing breaks live URLs.
const DEFAULT_ARBITRATIONS = {
  valence: '26',
  'saint-denis': '93',
  'saint-nazaire': '44',
  chatillon: '92',
  langon: '33',
  'saint-gilles': '30',
  amilly: '45',
  merville: '59',
  grigny: '91',
  'saint-andre': '974',
  'saint-benoit': '974',
  'oree-d-anjou': '49069',
}

const TYPES = { Appartement: 'apartment', Maison: 'house' }

// --- helpers ----------------------------------------------------------------

// DuckDB returns BIGINT as BigInt and DOUBLE as number.
const num = (v) => (v === null || v === undefined ? null : Number(v))

const slugify = (name) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const groupBy = (rows, key) => {
  const map = new Map()
  for (const row of rows) {
    const k = key(row)
    let bucket = map.get(k)
    if (!bucket) map.set(k, (bucket = []))
    bucket.push(row)
  }
  return map
}

// --- read the database ------------------------------------------------------

const instance = await DuckDBInstance.create(DB, { access_mode: 'READ_ONLY' })
const connection = await instance.connect()

const query = async (sql) => {
  const reader = await connection.runAndReadAll(sql)
  return reader.getRowObjects()
}

// The *_villes tables hold Paris/Lyon/Marseille recomputed from the sales, not
// averaged from their arrondissements. They sit alongside the arrondissements,
// which keep their own pages.
const [recentRows, yearlyRows, roomRows, roomYearlyRows] = await Promise.all([
  query(`SELECT code_commune, nom_commune, code_departement, type_local, n,
                prix_m2_median, prix_m2_d1, prix_m2_q1, prix_m2_q3, prix_m2_d9,
                prix_median, surface_mediane
         FROM agg_recent
         UNION ALL
         SELECT code_commune, nom_commune, code_departement, type_local, n,
                prix_m2_median, prix_m2_d1, prix_m2_q1, prix_m2_q3, prix_m2_d9,
                prix_median, surface_mediane
         FROM agg_recent_villes`),
  query(`SELECT code_commune, annee, type_local, n, prix_m2_median, prix_median
         FROM agg_annuel
         UNION ALL
         SELECT code_commune, annee, type_local, n, prix_m2_median, prix_median
         FROM agg_annuel_villes`),
  query(`SELECT code_commune, type_local, pieces, n, prix_median, prix_q1, prix_q3,
                prix_m2_median, surface_mediane, surface_q1, surface_q3
         FROM agg_pieces
         UNION ALL
         SELECT code_commune, type_local, pieces, n, prix_median, prix_q1, prix_q3,
                prix_m2_median, surface_mediane, surface_q1, surface_q3
         FROM agg_pieces_villes`),
  query(`SELECT code_commune, annee, type_local, pieces, n, prix_median, prix_m2_median
         FROM agg_pieces_annuel
         UNION ALL
         SELECT code_commune, annee, type_local, pieces, n, prix_median, prix_m2_median
         FROM agg_pieces_annuel_villes`),
])

connection.closeSync()
instance.closeSync()

// --- select communes --------------------------------------------------------

const departments = readJson(DEPARTMENTS_FILE)
const recentByCommune = groupBy(recentRows, (r) => r.code_commune)

const selected = []
const unknownDepartments = new Set()

for (const [code, rows] of recentByCommune) {
  const maxSales = Math.max(...rows.map((r) => num(r.n)))
  if (maxSales < MIN_SALES) continue

  const department = departments[rows[0].code_departement]
  if (!department) {
    unknownDepartments.add(rows[0].code_departement)
    continue
  }

  selected.push({
    code,
    name: rows[0].nom_commune,
    departmentCode: rows[0].code_departement,
    department: {
      code: rows[0].code_departement,
      name: department.nom,
      slug: department.slug,
    },
    kind: CITY_CODES.has(code)
      ? 'city'
      : /^(751\d\d|6938\d|132\d\d)$/.test(code)
        ? 'arrondissement'
        : 'commune',
    maxSales,
    rows,
  })
}

selected.sort((a, b) => a.code.localeCompare(b.code))

// --- slugs and homonyms -----------------------------------------------------

// Two communes can share a slug. The department suffix tells them apart, but
// something still has to decide who keeps the bare slug — that is what
// homonymes.json holds, and it is never recomputed: rewriting it after
// indexing would change URLs that are already referenced.
const frozen = existsSync(HOMONYMS_FILE) ? readJson(HOMONYMS_FILE) : {}
const homonyms = {}
const warnings = []
const pendingArbitrations = []

const bySlug = groupBy(selected, (c) => slugify(c.name))

for (const [slug, candidates] of bySlug) {
  const entry = frozen[slug]
  // A slug that no longer collides stays managed once frozen: otherwise the
  // surviving commune would reclaim the bare slug and change its URL.
  if (candidates.length < 2 && !entry) continue

  const descriptors = candidates
    .map((c) => ({ code: c.code, name: c.name, department: c.departmentCode }))
    .sort((a, b) => a.code.localeCompare(b.code))

  let winner
  if (entry && 'winner' in entry) {
    winner = entry.winner
  } else {
    const arbitration = DEFAULT_ARBITRATIONS[slug]
    const matches = arbitration
      ? candidates.filter(
          (c) => c.code === arbitration || c.departmentCode === arbitration
        )
      : []
    if (matches.length === 1) {
      winner = matches[0].code
    } else {
      winner = null
      if (arbitration) {
        warnings.push(
          `arbitration "${slug}" -> ${arbitration}: ${matches.length} candidate(s), ignored`
        )
      }
      pendingArbitrations.push({ slug, candidates: descriptors })
    }
  }

  if (winner && !candidates.some((c) => c.code === winner)) {
    warnings.push(
      `homonymes.json: "${slug}" arbitrated to ${winner}, which is not in the export — bare slug left unassigned`
    )
  }

  homonyms[slug] = { winner, candidates: descriptors }
}

for (const [slug, entry] of Object.entries(frozen)) {
  if (!homonyms[slug]) {
    // Orphaned entries are kept: the commune may clear the threshold again in
    // a later release and must get the same URL back.
    homonyms[slug] = entry
    warnings.push(`homonymes.json: "${slug}" has no exported commune left, entry kept`)
  }
}

for (const commune of selected) {
  const slug = slugify(commune.name)
  const entry = homonyms[slug]
  commune.slug =
    !entry || entry.winner === commune.code
      ? slug
      : `${slug}-${commune.departmentCode.toLowerCase()}`
}

// Safety net: two homonyms in the same department (Orée d'Anjou, where DVF
// labels a delegated commune with the name of the commune nouvelle) still
// collide after the department suffix. Fall back to the INSEE code.
const finalSlugs = groupBy(selected, (c) => c.slug)
for (const [slug, candidates] of finalSlugs) {
  if (candidates.length < 2) continue
  for (const commune of candidates) {
    commune.slug = `${slug}-${commune.code}`
    warnings.push(`residual collision on "${slug}" -> ${commune.slug} (${commune.name})`)
  }
}

// --- assemble ----------------------------------------------------------------

const yearlyByCommune = groupBy(yearlyRows, (r) => r.code_commune)
const roomsByCommune = groupBy(roomRows, (r) => r.code_commune)
const roomYearlyByCommune = groupBy(roomYearlyRows, (r) => r.code_commune)

// An empty block explicitly means "nothing publishable here", where a missing
// key would leave the reader wondering whether the export went wrong.
const buildRecent = (rows) => {
  const out = { apartment: {}, house: {} }
  for (const row of rows) {
    if (num(row.n) < MIN_SALES) continue
    out[TYPES[row.type_local]] = {
      count: num(row.n),
      pricePerSqm: num(row.prix_m2_median),
      medianPrice: num(row.prix_median),
      medianArea: num(row.surface_mediane),
      d1: num(row.prix_m2_d1),
      q1: num(row.prix_m2_q1),
      q3: num(row.prix_m2_q3),
      d9: num(row.prix_m2_d9),
    }
  }
  return out
}

const buildYearly = (rows = []) =>
  [...groupBy(rows, (r) => num(r.annee))]
    .sort(([a], [b]) => a - b)
    .map(([year, yearRows]) => {
      const entry = { year, apartment: {}, house: {} }
      for (const row of yearRows) {
        entry[TYPES[row.type_local]] = {
          count: num(row.n),
          pricePerSqm: num(row.prix_m2_median),
          medianPrice: num(row.prix_median),
        }
      }
      return entry
    })

const buildRooms = (rows = [], yearlyRows = []) => {
  const seriesByCell = groupBy(yearlyRows, (r) => `${r.type_local}:${num(r.pieces)}`)

  const out = { apartment: [], house: [] }
  for (const row of rows) {
    const count = num(row.n)
    const series = seriesByCell.get(`${row.type_local}:${num(row.pieces)}`) ?? []

    out[TYPES[row.type_local]].push({
      rooms: num(row.pieces),
      count,
      medianPrice: num(row.prix_median),
      priceQ1: num(row.prix_q1),
      priceQ3: num(row.prix_q3),
      pricePerSqm: num(row.prix_m2_median),
      medianArea: num(row.surface_mediane),
      areaQ1: num(row.surface_q1),
      areaQ3: num(row.surface_q3),
      // Omitted rather than left empty on thin cells, against the convention the
      // type blocks follow: `"yearly":[]` on every one of the 23 000 cells that
      // do not clear the bar is a quarter of a megabyte spelling out an absence
      // the missing key already states unambiguously for an array.
      ...(count >= MIN_ROOM_SERIES_SALES && series.length
        ? {
            yearly: series
              .map((entry) => ({
                year: num(entry.annee),
                count: num(entry.n),
                medianPrice: num(entry.prix_median),
                pricePerSqm: num(entry.prix_m2_median),
              }))
              .sort((a, b) => a.year - b.year),
          }
        : {}),
    })
  }
  out.apartment.sort((a, b) => a.rooms - b.rooms)
  out.house.sort((a, b) => a.rooms - b.rooms)
  return out
}

const communes = selected.map((commune) => ({
  code: commune.code,
  name: commune.name,
  slug: commune.slug,
  kind: commune.kind,
  department: commune.department,
  recent: buildRecent(commune.rows),
  yearly: buildYearly(yearlyByCommune.get(commune.code)),
  rooms: buildRooms(roomsByCommune.get(commune.code), roomYearlyByCommune.get(commune.code)),
}))

// --- write -------------------------------------------------------------------

writeJsonIfChanged(HOMONYMS_FILE, homonyms, 2)
writeFileSync(OUT, JSON.stringify(communes))

function writeJsonIfChanged(path, value, indent) {
  const next = JSON.stringify(value, null, indent) + '\n'
  if (existsSync(path) && readFileSync(path, 'utf8') === next) return
  writeFileSync(path, next)
}

// --- report ------------------------------------------------------------------

const count = (kind) => communes.filter((c) => c.kind === kind).length
const bytes = statSync(OUT).size
const withHouse = communes.filter((c) => c.recent.house.count).length
const withApartment = communes.filter((c) => c.recent.apartment.count).length

const allRoomCells = communes.flatMap((c) => [...c.rooms.apartment, ...c.rooms.house])
const roomCells = allRoomCells.length
const roomCellsWithSeries = allRoomCells.filter((cell) => cell.yearly).length

console.log(`\ndata/communes.json`)
console.log(`  communes exported : ${communes.length}`)
console.log(`    communes           : ${count('commune')}`)
console.log(`    arrondissements    : ${count('arrondissement')}`)
console.log(`    aggregated cities  : ${count('city')}`)
console.log(`  with an apartment median : ${withApartment}`)
console.log(`  with a house median      : ${withHouse}`)
console.log(`  room-count cells carrying a series : ${roomCellsWithSeries} of ${roomCells}`)
console.log(`  size : ${(bytes / 1024 / 1024).toFixed(2)} MB (${bytes.toLocaleString('en-US')} bytes)`)

console.log(`\ndata/homonymes.json`)
console.log(`  colliding slugs : ${Object.keys(homonyms).length}`)
console.log(`  arbitrated (bare slug assigned) : ${Object.values(homonyms).filter((e) => e.winner).length}`)

if (pendingArbitrations.length) {
  console.log(`\n  ${pendingArbitrations.length} slug(s) without arbitration — every commune takes the department suffix:`)
  for (const { slug, candidates } of pendingArbitrations) {
    const detail = candidates.map((c) => `${c.name} (${c.department})`).join(' / ')
    console.log(`    ${slug} : ${detail}`)
  }
  console.log(`  Set "winner" in data/homonymes.json to hand out the bare slug.`)
}

if (unknownDepartments.size) {
  warnings.push(`department(s) missing from departements.json, communes skipped: ${[...unknownDepartments].join(', ')}`)
}

if (warnings.length) {
  console.log(`\nWarnings:`)
  for (const warning of warnings) console.log(`  - ${warning}`)
}

console.log()
