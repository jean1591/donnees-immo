// National rankings — the cross-cutting lists no single commune or department
// page can produce, and the queries a search summary cannot answer without the
// underlying data: ranking the cheapest communes of France takes 3 630 medians,
// not a paragraph of commentary.
//
// Every ranking is built within one property type. A house median and an
// apartment median describe two different markets, and the department pages
// already refuse to mix them; a national list would only make the mistake
// bigger. Blocks failing `isRankable` are dropped — see communes.js.

import { allCommunes, hasData, isRankable, rankByEvolution } from './communes.js'

export const RANKING_SIZE = 50
export const TREND_SIZE = 30

// Arrondissements sit out of the national rankings for the same reason they sit
// out of the department tables: Paris, Lyon and Marseille are published both as
// a city and as their arrondissements, so keeping both would rank one market
// twice and hand a third of the apartment top 50 to a single city. Paris counts
// as one line.
//
// They get no national ranking of their own either. Nobody compares the 7th
// arrondissement of Lyon to the 7th of Marseille — a table of the 45 in one
// sort order answers a question no reader asks. Comparing arrondissements
// within one city is a different matter, and that belongs to the city's page.
const cities = allCommunes.filter((commune) => commune.kind !== 'arrondissement')

const byPrice = (list, type) =>
  list
    .filter((commune) => isRankable(commune.recent[type]))
    .sort((a, b) => b.recent[type].pricePerSqm - a.recent[type].pricePerSqm)

/** How many communes publish a rankable median for this type. */
export const rankedCount = (type) => byPrice(cities, type).length

/**
 * Where one commune sits in the national price ranking, 1-based, or 0 if it is
 * not ranked. Used to state a position in prose — « Paris n'arrive qu'en 7e
 * position » — without pinning the number into the text, where the next release
 * would leave it behind.
 */
export const priceRank = (code, type) =>
  byPrice(cities, type).findIndex((commune) => commune.code === code) + 1

export const dearest = (type, size = RANKING_SIZE) => byPrice(cities, type).slice(0, size)

/** Cheapest first, so the reader's first row is the answer to the question. */
export const cheapest = (type, size = RANKING_SIZE) => byPrice(cities, type).slice(-size).reverse()

/**
 * Communes publishing a median for this type that no ranking will take — the
 * page naming them is the cheapest ranking, which is where they would otherwise
 * have landed, and where the omission would be noticed.
 */
export const unrankable = (type) =>
  cities
    .filter((commune) => hasData(commune.recent[type]) && !isRankable(commune.recent[type]))
    .sort((a, b) => a.recent[type].pricePerSqm - b.recent[type].pricePerSqm)

/**
 * Where prices moved over the last year, nationally.
 *
 * The pool is far smaller than the price ranking: a commune has to hold 50
 * sales in both calendar years, not just across the 24-month window, which is
 * the bar `rankByEvolution` enforces. Falling short of it, a ranking sorted on
 * the extremes would return whatever the sampling allowed rather than whatever
 * the market did.
 */
export const trends = (type, size = TREND_SIZE) => {
  const ranked = rankByEvolution(
    cities.filter((commune) => isRankable(commune.recent[type])),
    type,
    1
  )
  if (ranked.length < size * 2) return null

  const falling = ranked.filter((entry) => entry.ratio < 0)
  const rising = ranked.filter((entry) => entry.ratio > 0)
  const middle = ranked[Math.floor(ranked.length / 2)]

  return {
    from: ranked[0].from,
    to: ranked[0].to,
    eligible: ranked.length,
    // Counted strictly either side of zero, so the two do not add up to
    // `eligible`: five communes across both types closed the year on exactly
    // the median they opened it with.
    fallingCount: falling.length,
    fallingShare: falling.length / ranked.length,
    risingCount: rising.length,
    risingShare: rising.length / ranked.length,
    /** The median commune's own change — the typical move, not the average of the extremes. */
    median: middle.ratio,
    rising: ranked.slice(0, size),
    falling: ranked.slice(-size).reverse(),
  }
}
