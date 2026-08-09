// Build-time dataset access. communes.json is committed: the build must never
// depend on etl/dvf.db, which is not deployable.

import communes from '../../data/communes.json'

export const TYPES = ['apartment', 'house']

export const allCommunes = communes

export const byCode = new Map(communes.map((commune) => [commune.code, commune]))

/** A type block is either published or empty — `count` is the tell. */
export const hasData = (block) => Boolean(block && block.count)

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
 * Relative change of the median price per sqm over `span` years.
 * Returns null when either endpoint is missing or too thin — no figure beats a
 * figure computed against a year that isn't there, or one that can't hold it.
 */
export const evolution = (commune, type, span) => {
  const to = latestYear(commune, type)
  if (!to) return null

  const from = commune.yearly.find(
    (entry) => entry.year === to.year - span && entry[type]?.pricePerSqm
  )
  if (!from) return null

  if (Math.min(from[type].count, to[type].count) < MIN_TREND_SALES) return null

  return {
    from: from.year,
    to: to.year,
    ratio: to[type].pricePerSqm / from[type].pricePerSqm - 1,
  }
}

/** Yearly sale volume, across every published type. */
export const yearlyVolume = (commune) =>
  commune.yearly.map((entry) => ({
    year: entry.year,
    count: TYPES.reduce((sum, type) => sum + (entry[type]?.count ?? 0), 0),
  }))

/** Communes in the same department, excluding arrondissements, by volume. */
export const neighbours = (commune, limit = 8) =>
  communes
    .filter(
      (other) =>
        other.code !== commune.code &&
        other.department.code === commune.department.code &&
        other.kind !== 'arrondissement'
    )
    .sort((a, b) => topCount(b) - topCount(a))
    .slice(0, limit)

const topCount = (commune) =>
  Math.max(commune.recent.apartment.count ?? 0, commune.recent.house.count ?? 0)

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
