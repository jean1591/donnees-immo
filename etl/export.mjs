#!/usr/bin/env node
// Lit les tables d'agrégats de etl/dvf.db et produit data/communes.json.
// Ne tourne qu'en local, deux fois par an, après 03-aggregate.sql.
//
//   node etl/export.mjs
//
// Effets de bord : écrit data/communes.json et, si de nouvelles collisions de
// slug apparaissent, complète data/homonymes.json (jamais réécrit à zéro).

import { DuckDBInstance } from '@duckdb/node-api'
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB = join(ROOT, 'etl', 'dvf.db')
const DEPARTEMENTS = join(ROOT, 'data', 'departements.json')
const HOMONYMES = join(ROOT, 'data', 'homonymes.json')
const OUT = join(ROOT, 'data', 'communes.json')

// Seuil de publication : en dessous, la marge d'erreur sur la médiane dépasse
// 10 % (cf. CLAUDE.md). Une commune est retenue sur son type le plus vendu,
// mais chaque bloc de type est publié séparément sous la même règle.
const MIN_SALES = 50

// Codes INSEE des trois villes reconstituées à partir des arrondissements.
const CITY_CODES = new Set(['75056', '69123', '13055'])

// Qui récupère le slug nu quand plusieurs communes le revendiquent. La valeur
// est un code de département, ou un code INSEE quand les candidats partagent
// le même département. Ces choix sont figés dans data/homonymes.json au
// premier passage : les modifier après indexation casse les URLs.
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

// --- utilitaires ------------------------------------------------------------

// DuckDB renvoie les BIGINT en BigInt et les DOUBLE en number.
const num = (v) => (v === null || v === undefined ? null : Number(v))

const slugify = (name) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

// --- lecture de la base -----------------------------------------------------

const instance = await DuckDBInstance.create(DB, { access_mode: 'READ_ONLY' })
const connection = await instance.connect()

const query = async (sql) => {
  const reader = await connection.runAndReadAll(sql)
  return reader.getRowObjects()
}

// Les tables *_villes portent Paris/Lyon/Marseille reconstitués depuis les
// ventes, pas une moyenne des arrondissements. Elles s'ajoutent aux
// arrondissements, qui gardent leurs propres pages.
const [recent, yearly, rooms] = await Promise.all([
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
  query(`SELECT code_commune, type_local, pieces, n, prix_median, surface_mediane
         FROM agg_pieces
         UNION ALL
         SELECT code_commune, type_local, pieces, n, prix_median, surface_mediane
         FROM agg_pieces_villes`),
])

connection.closeSync()
instance.closeSync()

// --- sélection des communes -------------------------------------------------

const departements = readJson(DEPARTEMENTS)
const recentByCommune = groupBy(recent, (r) => r.code_commune)

const selected = []
const unknownDepartements = new Set()

for (const [code, rows] of recentByCommune) {
  const maxSales = Math.max(...rows.map((r) => num(r.n)))
  if (maxSales < MIN_SALES) continue

  const departement = departements[rows[0].code_departement]
  if (!departement) {
    unknownDepartements.add(rows[0].code_departement)
    continue
  }

  selected.push({
    code,
    name: rows[0].nom_commune,
    departmentCode: rows[0].code_departement,
    department: {
      code: rows[0].code_departement,
      name: departement.nom,
      slug: departement.slug,
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

// --- slugs et homonymes -----------------------------------------------------

// Deux communes peuvent partager un slug. Le suffixe départemental les
// distingue, mais il faut encore décider qui garde le slug nu — c'est le rôle
// de homonymes.json, qui n'est jamais recalculé : une réédition du fichier
// après indexation changerait les URLs déjà référencées.
const frozen = existsSync(HOMONYMES) ? readJson(HOMONYMES) : {}
const homonymes = {}
const warnings = []
const pendingArbitrations = []

const bySlug = groupBy(selected, (c) => slugify(c.name))

for (const [slug, candidates] of bySlug) {
  const entry = frozen[slug]
  // Un slug qui ne collisionne plus reste géré s'il a déjà été figé : sinon la
  // commune survivante récupérerait le slug nu et son URL changerait.
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
          `arbitrage "${slug}" -> ${arbitration} : ${matches.length} candidat(s), ignoré`
        )
      }
      pendingArbitrations.push({ slug, candidates: descriptors })
    }
  }

  if (winner && !candidates.some((c) => c.code === winner)) {
    warnings.push(
      `homonymes.json : "${slug}" arbitré vers ${winner}, absent de l'export — slug nu non attribué`
    )
  }

  homonymes[slug] = { winner, candidates: descriptors }
}

for (const [slug, entry] of Object.entries(frozen)) {
  if (!homonymes[slug]) {
    // On conserve les entrées orphelines : la commune peut repasser au-dessus
    // du seuil à la prochaine publication et doit retrouver la même URL.
    homonymes[slug] = entry
    warnings.push(`homonymes.json : "${slug}" n'a plus de commune exportée, entrée conservée`)
  }
}

for (const commune of selected) {
  const slug = slugify(commune.name)
  const entry = homonymes[slug]
  commune.slug =
    !entry || entry.winner === commune.code
      ? slug
      : `${slug}-${commune.departmentCode.toLowerCase()}`
}

// Filet de sécurité : deux homonymes du même département (Orée d'Anjou, où DVF
// étiquette une commune déléguée du nom de la commune nouvelle) restent en
// collision après suffixe départemental. On suffixe alors par code INSEE.
const finalSlugs = groupBy(selected, (c) => c.slug)
for (const [slug, candidates] of finalSlugs) {
  if (candidates.length < 2) continue
  for (const commune of candidates) {
    commune.slug = `${slug}-${commune.code}`
    warnings.push(`collision résiduelle sur "${slug}" -> ${commune.slug} (${commune.name})`)
  }
}

// --- assemblage --------------------------------------------------------------

const yearlyByCommune = groupBy(yearly, (r) => r.code_commune)
const roomsByCommune = groupBy(rooms, (r) => r.code_commune)

// Un bloc vide signale explicitement "pas de donnée publiable", là où une clé
// absente laisserait planer le doute sur un export incomplet.
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

const buildRooms = (rows = []) => {
  const out = { apartment: [], house: [] }
  for (const row of rows) {
    out[TYPES[row.type_local]].push({
      rooms: num(row.pieces),
      count: num(row.n),
      medianPrice: num(row.prix_median),
      medianArea: num(row.surface_mediane),
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
  rooms: buildRooms(roomsByCommune.get(commune.code)),
}))

// --- écriture ----------------------------------------------------------------

writeJsonIfChanged(HOMONYMES, homonymes, 2)
writeFileSync(OUT, JSON.stringify(communes))

function writeJsonIfChanged(path, value, indent) {
  const next = JSON.stringify(value, null, indent) + '\n'
  if (existsSync(path) && readFileSync(path, 'utf8') === next) return
  writeFileSync(path, next)
}

// --- rapport -----------------------------------------------------------------

const count = (kind) => communes.filter((c) => c.kind === kind).length
const bytes = statSync(OUT).size
const withHouse = communes.filter((c) => c.recent.house.count).length
const withApartment = communes.filter((c) => c.recent.apartment.count).length

console.log(`\ndata/communes.json`)
console.log(`  communes exportées : ${communes.length}`)
console.log(`    dont communes         : ${count('commune')}`)
console.log(`    dont arrondissements  : ${count('arrondissement')}`)
console.log(`    dont villes agrégées  : ${count('city')}`)
console.log(`  avec médiane appartement : ${withApartment}`)
console.log(`  avec médiane maison      : ${withHouse}`)
console.log(`  taille : ${(bytes / 1024 / 1024).toFixed(2)} MB (${bytes.toLocaleString('fr-FR')} octets)`)

console.log(`\ndata/homonymes.json`)
console.log(`  slugs en collision : ${Object.keys(homonymes).length}`)
console.log(`  arbitrés (slug nu attribué) : ${Object.values(homonymes).filter((e) => e.winner).length}`)

if (pendingArbitrations.length) {
  console.log(`\n  ${pendingArbitrations.length} slug(s) sans arbitrage — toutes les communes prennent le suffixe départemental :`)
  for (const { slug, candidates } of pendingArbitrations) {
    const detail = candidates.map((c) => `${c.name} (${c.department})`).join(' / ')
    console.log(`    ${slug} : ${detail}`)
  }
  console.log(`  Renseigner "winner" dans data/homonymes.json pour attribuer le slug nu.`)
}

if (unknownDepartements.size) {
  warnings.push(`département(s) inconnu(s) de departements.json, communes ignorées : ${[...unknownDepartements].join(', ')}`)
}

if (warnings.length) {
  console.log(`\nAvertissements :`)
  for (const warning of warnings) console.log(`  - ${warning}`)
}

console.log()
