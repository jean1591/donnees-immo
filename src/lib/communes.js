// Build-time dataset access. communes.json is committed: the build must never
// depend on etl/dvf.db, which is not deployable.

import communes from '../../data/communes.json'

export const TYPES = ['apartment', 'house']

export const allCommunes = communes

export const byCode = new Map(communes.map((commune) => [commune.code, commune]))

/** A type block is either published or empty — `count` is the tell. */
export const hasData = (block) => Boolean(block && block.count)

/**
 * A quarter of the sales below this price per sqm, with a quartile spread wider
 * than this ratio, is the signature of a median computed over something other
 * than a housing market.
 *
 * Six blocks in the dataset carry it, all in Guadeloupe and Martinique.
 * Sainte-Rose publishes a median house at 157 €/m² — 13 008 € for 90 m² — with
 * a first quartile at 80 €/m². These are not cheap markets: they are communes
 * where a large share of the recorded mutations are not sales at market price
 * (indivisions, successions, transfers between relatives), which DVF carries
 * nothing to identify one by one.
 *
 * The median absorbs a few such transfers — that is the whole reason the site
 * publishes medians — but not a quarter of them. The 99th percentile of the
 * interquartile ratio across the dataset is 2.6, so the rule catches the tail
 * and nothing else: Courchevel spreads 6 306 → 35 130 €/m² and stays, and
 * Bourbonne-les-Bains keeps its 449 €/m² median, the cheapest in mainland
 * France, on a spread of 2.7.
 */
const MIN_RANKING_Q1 = 500
const MAX_RANKING_SPREAD = 4

/**
 * Whether a type block can be ranked against other communes.
 *
 * Only rankings are gated. The figure stays on the commune's own page, next to
 * the deciles that show what it is made of — suppressing it there would hide
 * the one place a reader can see the problem. What it cannot do is take first
 * place in a national ranking of the cheapest communes, where it would arrive
 * stripped of that context and be read as a price.
 */
export const isRankable = (block) =>
  hasData(block) && !(block.q1 < MIN_RANKING_Q1 && block.q3 / block.q1 > MAX_RANKING_SPREAD)

/** Published types for this commune, best-selling first. */
export const publishedTypes = (commune) =>
  TYPES.filter((type) => hasData(commune.recent[type])).sort(
    (a, b) => commune.recent[b].count - commune.recent[a].count
  )

/** Latest year holding a price-per-sqm median for this type. */
export const latestYear = (commune, type) => {
  for (let i = commune.yearly.length - 1; i >= 0; i -= 1) {
    if (commune.yearly[i][type]?.pricePerSqm) return commune.yearly[i]
  }
  return null
}

/**
 * Minimum sales in BOTH endpoint years before a change is worth stating.
 * The yearly aggregate only filters at 10 sales, which is enough to plot a
 * point but not to subtract two of them: a year at 20 sales carries a ~14 %
 * margin on its own median, so the difference is mostly noise. Measured on the
 * dataset, 25 % of communes produced a one-year change below this bar,
 * including a −94 % on 23 sales.
 */
const MIN_TREND_SALES = 30

/**
 * Higher bar for ranking communes against each other, rather than stating one
 * commune's own change. A ranking sorts on the extremes, so it selects whatever
 * noise the sample allows: at 30-49 sales the median one-year change across the
 * dataset is already 5.2 % and the 90th percentile 15.7 %, which is the margin
 * on the median itself, not market movement. At 50 the same percentiles fall to
 * 4.1 % and 11.2 %. 50 is also the site's own publication threshold, stated on
 * every page — ranking on thinner years would contradict it.
 */
const MIN_RANKING_SALES = 50

/**
 * Relative change of the median price per sqm over `span` years.
 * Returns null when either endpoint is missing or too thin — no figure beats a
 * figure computed against a year that isn't there, or one that can't hold it.
 */
export const evolution = (commune, type, span, minSales = MIN_TREND_SALES) => {
  const to = latestYear(commune, type)
  if (!to) return null

  const from = commune.yearly.find(
    (entry) => entry.year === to.year - span && entry[type]?.pricePerSqm
  )
  if (!from) return null

  if (Math.min(from[type].count, to[type].count) < minSales) return null

  return {
    from: from.year,
    to: to.year,
    ratio: to[type].pricePerSqm / from[type].pricePerSqm - 1,
  }
}

/**
 * Last year present anywhere in the dataset. Derived rather than read from
 * DATASET so the two can never disagree: a ranking pinned to a year the export
 * did not produce would silently come out empty.
 */
export const lastDatasetYear = Math.max(...communes.flatMap((c) => c.yearly.map((y) => y.year)))

const yearEntry = (commune, year, type) => {
  const entry = commune.yearly.find((candidate) => candidate.year === year)
  return entry?.[type]?.pricePerSqm ? entry[type] : null
}

/**
 * Communes of `list` ranked by their change over `span` years, steepest rise
 * first.
 *
 * Both endpoints are pinned to the same calendar years for every commune, which
 * `evolution` deliberately does not do — it walks back to each commune's own
 * latest year, which is right for a single page and wrong for a ranking, where
 * it would sort a 2024→2025 change against a 2023→2024 one. Communes missing
 * either year, or below MIN_RANKING_SALES in either, drop out; the caller
 * decides whether what remains is enough to publish.
 */
export const rankByEvolution = (list, type, span = 1) => {
  const to = lastDatasetYear
  const from = to - span

  return list
    .map((commune) => {
      const before = yearEntry(commune, from, type)
      const after = yearEntry(commune, to, type)
      if (!before || !after) return null
      if (Math.min(before.count, after.count) < MIN_RANKING_SALES) return null
      return {
        commune,
        from,
        to,
        before,
        after,
        ratio: after.pricePerSqm / before.pricePerSqm - 1,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.ratio - a.ratio)
}

/** Yearly sale volume, across every published type. */
export const yearlyVolume = (commune) =>
  commune.yearly.map((entry) => ({
    year: entry.year,
    count: TYPES.reduce((sum, type) => sum + (entry[type]?.count ?? 0), 0),
  }))

/**
 * Communes of the same department sitting either side of this one on price,
 * for its best-selling type — the window is centred on the commune, so the list
 * runs from cheaper to dearer around it.
 *
 * This used to return the eight highest-volume communes of the department,
 * which was the same eight for every page: 2 794 of 3 630 communes ended up
 * with exactly one internal inbound link, the department table. Centring the
 * window instead makes the graph roughly reciprocal — each commune now appears
 * in about eight others' lists — and « des communes au prix comparable » is a
 * more useful list to a reader than « les huit plus grosses ».
 *
 * Both sides of the comparison publish the same type: a house median against an
 * apartment median compares two different markets, the same reason the
 * department rankings pick a single type.
 */
export const comparables = (commune, limit = 8) => {
  const type = publishedTypes(commune)[0]
  const peers = communes.filter(
    (other) =>
      other.code !== commune.code &&
      other.department.code === commune.department.code &&
      other.kind !== 'arrondissement' &&
      hasData(other.recent[type])
  )
  if (peers.length <= limit) return { type, list: peers }

  const price = (entry) => entry.recent[type].pricePerSqm
  const sorted = [...peers, commune].sort((a, b) => price(a) - price(b))
  const index = sorted.findIndex((entry) => entry.code === commune.code)

  // The window keeps its full width at either end of the range rather than
  // being clipped, so the cheapest commune of a department still gets a list of
  // `limit` rather than half of one.
  let start = Math.max(0, index - Math.floor(limit / 2))
  let end = start + limit + 1
  if (end > sorted.length) {
    end = sorted.length
    start = end - limit - 1
  }

  return { type, list: sorted.slice(start, end).filter((entry) => entry.code !== commune.code) }
}

/** Arrondissements belonging to a rebuilt city (Paris, Lyon, Marseille). */
const CITY_PREFIXES = { 75056: '751', 69123: '6938', 13055: '132' }

export const arrondissements = (commune) => {
  const prefix = CITY_PREFIXES[commune.code]
  if (!prefix) return []
  return communes
    .filter((other) => other.kind === 'arrondissement' && other.code.startsWith(prefix))
    .sort((a, b) => a.code.localeCompare(b.code))
}

/** The city an arrondissement belongs to. */
export const parentCity = (commune) => {
  if (commune.kind !== 'arrondissement') return null
  const code = Object.keys(CITY_PREFIXES).find((city) =>
    commune.code.startsWith(CITY_PREFIXES[city])
  )
  return code ? byCode.get(code) : null
}
