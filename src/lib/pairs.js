// The city-versus-city pages: the ten largest French cities, every pair of them.
//
// Ten cities give 45 pages. The family deliberately stops there rather than
// running over the hundred largest markets, which would give 4 950: at that
// scale every page would be two tables the reader can already find on the two
// commune pages, which is the thin-content profile Google's helpful content
// system acts on — and it acts at the level of the domain, not of the offending
// pages. Forty-five is small enough that each page can carry figures computed
// on the pair itself, which neither commune page states.

import {
  allCommunes,
  byCode,
  evolution,
  hasData,
  TYPES,
} from './communes.js'
import { national } from './departments.js'
import { PAGE_ROOMS, hasRoomPage, roomCell } from './rooms.js'

/**
 * The ten most populous communes of France — INSEE municipal populations,
 * 2023 vintage, in force since 1 January 2026 — minus Strasbourg.
 *
 * Strasbourg ranks eighth and has no figures to compare: Bas-Rhin is one of the
 * four départements missing from DVF, with Haut-Rhin, Moselle and Mayotte.
 * Rennes, eleventh, takes the vacant slot rather than leaving the family with
 * nine cities and 36 pairs.
 *
 * The same ten come out of a ranking by sale volume, in a different order, so
 * the selection does not hang on which of the two criteria is used.
 *
 * Codes rather than names: Paris, Lyon and Marseille each carry a rebuilt city
 * entry whose name also matches its own arrondissements.
 */
export const PAIR_CITY_CODES = [
  '75056', // Paris
  '13055', // Marseille
  '69123', // Lyon
  '31555', // Toulouse
  '06088', // Nice
  '44109', // Nantes
  '34172', // Montpellier
  '33063', // Bordeaux
  '59350', // Lille
  '35238', // Rennes
]

export const pairCities = PAIR_CITY_CODES.map((code) => {
  const city = byCode.get(code)
  if (!city) throw new Error(`pairs.js: commune ${code} absente de communes.json`)
  return city
})

/**
 * What separates the two halves of a pair URL.
 *
 * « ou » rather than « vs » because it is how the question is typed:
 * « bordeaux ou toulouse ». It also keeps the family inside the existing flat
 * scheme instead of opening a second prefix.
 */
const SEPARATOR = '-ou-'

/**
 * The pair route occupies the same URL segment as the commune route —
 * /prix-immobilier-bordeaux-ou-toulouse against /prix-immobilier-bordeaux — and
 * the two are told apart by that infix alone. A commune slug carrying it would
 * be matched by both routes, and served by whichever Astro ranked higher: a
 * silent collision, on an address already indexed.
 *
 * No commune of the April 2026 release carries it. This fails the build rather
 * than let a later release introduce one unnoticed, which is the same reasoning
 * that froze homonymes.json.
 */
const clashing = allCommunes.filter((commune) => commune.slug.includes(SEPARATOR))
if (clashing.length) {
  throw new Error(
    `pairs.js: ${clashing.length} slug(s) contiennent "${SEPARATOR}" et entrent en collision ` +
      `avec la route des comparaisons : ${clashing.map((c) => c.slug).join(', ')}`
  )
}

/**
 * Canonical order inside a pair: alphabetical on the slug.
 *
 * Not by population or by sale volume, which would read more naturally — one
 * says « Paris ou Rennes », not the reverse — but both change with every DVF
 * release and with every INSEE vintage. A city overtaking another would flip
 * the URL of a page already indexed, the precise failure homonymes.json exists
 * to prevent. Alphabetical is arbitrary and immutable, and immutable wins.
 *
 * Compared on the slug rather than the name: slugs are reduced to [a-z0-9-]
 * upstream, so plain comparison is stable, where « Saint-Étienne » would sort
 * on its accent.
 */
const ordered = (a, b) => (a.slug < b.slug ? [a, b] : [b, a])

export const pairPath = (a, b) => {
  const [first, second] = ordered(a, b)
  return `/prix-immobilier-${first.slug}${SEPARATOR}${second.slug}`
}

/** Every unordered pair of the ten cities, 45 of them, in canonical order. */
export const pairs = pairCities
  .flatMap((a, index) => pairCities.slice(index + 1).map((b) => ordered(a, b)))
  .map(([a, b]) => ({ a, b }))
  .sort((left, right) => pairPath(left.a, left.b).localeCompare(pairPath(right.a, right.b)))

/** The pairs one city belongs to — its nine siblings, for the link block. */
export const pairsOf = (commune) =>
  pairs
    .filter(({ a, b }) => a.code === commune.code || b.code === commune.code)
    .map(({ a, b }) => (a.code === commune.code ? b : a))

export const isPairCity = (commune) => PAIR_CITY_CODES.includes(commune.code)

/**
 * A round buyer's budget, held constant across the 45 pages so the figure means
 * the same thing on all of them. Close enough to the national median sale —
 * 163 200 € for an apartment, 195 000 € for a house — to be a real budget,
 * while still buying something in the cities where it buys least.
 */
export const BUDGET = 250_000

/** Relative gap between the two cities on one type, dearer city first. */
const gap = (a, b, type) => {
  const [dearer, cheaper] =
    a.recent[type].pricePerSqm >= b.recent[type].pricePerSqm ? [a, b] : [b, a]
  return {
    dearer,
    cheaper,
    ratio: dearer.recent[type].pricePerSqm / cheaper.recent[type].pricePerSqm - 1,
    area: {
      [dearer.code]: BUDGET / dearer.recent[type].pricePerSqm,
      [cheaper.code]: BUDGET / cheaper.recent[type].pricePerSqm,
    },
  }
}

/**
 * How the two types rank against each other within one city.
 *
 * Counter-intuitive and worth stating: nationally the apartment is 53 % dearer
 * per square metre than the house, but in 970 of the 1 242 communes publishing
 * both, the house is the dearer of the two — an aggregation artefact, since the
 * cities holding most of the apartment stock are also the expensive ones. Among
 * these ten, Lille is the only one where the national ordering holds, which is
 * something its nine pages can say and no commune page does.
 */
const ordering = (commune) => {
  if (!hasData(commune.recent.apartment) || !hasData(commune.recent.house)) return null
  return commune.recent.house.pricePerSqm > commune.recent.apartment.pricePerSqm
    ? 'house'
    : 'apartment'
}

/** Typologies both cities publish, with the gap on each. */
const roomGaps = (a, b) =>
  PAGE_ROOMS.filter((rooms) => hasRoomPage(a, rooms) && hasRoomPage(b, rooms)).map((rooms) => {
    const cells = { [a.code]: roomCell(a, rooms), [b.code]: roomCell(b, rooms) }
    const [dearer, cheaper] =
      cells[a.code].pricePerSqm >= cells[b.code].pricePerSqm ? [a, b] : [b, a]
    return {
      rooms,
      cells,
      dearer,
      cheaper,
      ratio: cells[dearer.code].pricePerSqm / cells[cheaper.code].pricePerSqm - 1,
      // Signed against the first city, which is the one holding the left-hand
      // column: a table whose gap column changed reference from row to row would
      // read as noise. Positive means the first city is the dearer one.
      fromFirst: cells[a.code].pricePerSqm / cells[b.code].pricePerSqm - 1,
    }
  })

/**
 * Change over the full span of the dataset for both cities, when both can carry
 * one — five calendar years, so a span of four.
 *
 * This is where two cities at the same price today stop being the same market:
 * the level says what you pay, the trajectory says what the last five years did
 * to it, and only the pair page puts the two side by side.
 */
const TREND_SPAN = 4

const trends = (a, b, type) => {
  const left = evolution(a, type, TREND_SPAN)
  const right = evolution(b, type, TREND_SPAN)
  if (!left || !right) return null
  return { [a.code]: left, [b.code]: right, spread: Math.abs(left.ratio - right.ratio) }
}

/**
 * Everything a pair page states that neither commune page can.
 *
 * Returns null for `lead` when the two cities share no published type, which
 * cannot happen among these ten but would stop a wider selection from building
 * a page with nothing to compare.
 */
export const comparison = (a, b) => {
  const shared = TYPES.filter((type) => hasData(a.recent[type]) && hasData(b.recent[type]))
  // Best-selling shared type across the two, so the headline rests on the
  // deeper of the two samples rather than on whichever type comes first.
  const lead =
    shared.sort(
      (left, right) =>
        b.recent[right].count + a.recent[right].count - (b.recent[left].count + a.recent[left].count)
    )[0] ?? null

  return {
    types: shared,
    lead,
    gaps: Object.fromEntries(shared.map((type) => [type, gap(a, b, type)])),
    ordering: { [a.code]: ordering(a), [b.code]: ordering(b) },
    rooms: roomGaps(a, b),
    trends: lead ? trends(a, b, lead) : null,
    // The country over the same five years, so a local move can be read against
    // something. Two cities both up 13 % is a national tide, not a local story;
    // Bordeaux down 10 % while France is up 7 % is one.
    nationalTrend: lead ? evolution(national, lead, TREND_SPAN) : null,
  }
}
