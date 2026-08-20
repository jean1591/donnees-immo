// Room-count pages: one page per commune and per typology, « prix d'un T3 à
// Montreuil ».
//
// The commune pages already carry a room-count table. What they cannot carry is
// the reading of it — what a T3 measures locally, what the step up from a T2
// costs, how that one typology moved over five years — because doing it for
// every typology of every type would bury the commune's own figure. A typology
// deserving that treatment deserves its own page.
//
// Two things bound the selection, and they are different in kind. The sample
// bound is statistical and non-negotiable: a room-count cell holds about a fifth
// of a commune's sales, so the commune's 50-sale threshold buys nothing here.
// The commune bound is editorial — the long tail of « prix T3 » queries dries up
// well before the long tail of « prix immobilier » does, and 3 630 communes ×
// 3 typologies would be pages nobody searches for, diluting the ones people do.

import { allCommunes, hasData } from './communes.js'

/**
 * Apartments only — a demand call, not a sample one.
 *
 * The data would carry houses: 80 communes hold 100 sales or more in each of
 * their 3, 4 and 5-room cells, and across the fifty largest house markets the
 * thinnest of those cells still holds 72. What is missing is the search. « T3 »
 * is an apartment word; a house is shopped on its surface and its plot, and
 * « prix maison 4 pièces » is not a query people type. Publishing it would add
 * pages nobody looks for, which is the cost the commune bound below exists to
 * avoid.
 *
 * If houses are ever worth splitting, the axis to split them on is surface
 * bands, not room count. Nothing here is apartment-specific beyond this
 * constant.
 */
export const ROOM_PAGE_TYPE = 'apartment'

/**
 * T2, T3, T4 — and neither T1 nor T5+.
 *
 * Not an editorial preference: across the fifty largest apartment markets the
 * thinnest T2/T3/T4 cell holds 95 sales, while the thinnest T1-or-T5 cell holds
 * 6. The two ends of the range are residual almost everywhere, and gating them
 * cell by cell would publish a scattering of pages present in one commune and
 * missing in its neighbour for no reason a reader could see.
 */
export const PAGE_ROOMS = [2, 3, 4]

/**
 * Sales a cell needs over the 24-month window to get a page — the only gate.
 *
 * At 100 the measured margin of error on the median is 5.7 % for apartments,
 * against 8.0 % at 50 and 13.7 % at 20. The commune pages live with 50 because
 * their figure is the commune's whole apartment market, stated once; a typology
 * page states a narrower figure and invites it to be compared with the typology
 * next door, where an 8 % margin either side swallows the difference being read.
 *
 * This used to sit behind a second, editorial bound — the 50 largest apartment
 * markets — carried over from the configurator that was considered and dropped.
 * For a JavaScript tool the cap was right: every extra commune weighed on a
 * build and captured nothing. For a static page it is the opposite. A page that
 * draws five visits a month costs nothing, dilutes nothing while it clears the
 * bar above, and answers a query nobody else answers with data. The claim that
 * the tail of "prix T3" queries dries up early was never measured, and nothing
 * in the search data supports it.
 *
 * So the statistical bar is the whole selection now: publish wherever the data
 * holds, nowhere else. That is also the site's one argument against competitors
 * publishing all 34 875 communes regardless of sample.
 */
const MIN_CELL_SALES = 100

/**
 * Sales a single year needs before its point joins the series.
 *
 * Same 30 as `evolution` in communes.js, and for the same reason: a year at 20
 * sales carries a ~14 % margin of its own, so subtracting two of them measures
 * the sample rather than the market.
 */
const MIN_SERIES_SALES = 30

/**
 * Cells a department must publish before this commune is placed among them.
 *
 * The peers are drawn at the site's own 50-sale threshold rather than at
 * MIN_CELL_SALES: a comparison list needs enough entries to be a list, and every
 * price shown in it is already published on the commune page it links to. Three
 * neighbours is not a ranking, so below that the section does not appear.
 */
const MIN_PEER_SALES = 50
const MIN_PEERS = 3

/** Arrondissements are out, for the reason rankings.js states: Paris counts once. */
const communes = allCommunes.filter((commune) => commune.kind !== 'arrondissement')

/** The room-count cell for one commune and typology, or null. */
export const roomCell = (commune, rooms, type = ROOM_PAGE_TYPE) =>
  commune.rooms[type].find((cell) => cell.rooms === rooms) ?? null

/**
 * Every commune publishing at least one typology, largest apartment market
 * first. Computed once: every page asks for the same list, and every room-count
 * table asks whether its commune is in it.
 */
const selectedCommunes = communes
  .filter(
    (commune) =>
      hasData(commune.recent[ROOM_PAGE_TYPE]) &&
      PAGE_ROOMS.some((rooms) => (roomCell(commune, rooms)?.count ?? 0) >= MIN_CELL_SALES)
  )
  .sort((a, b) => b.recent[ROOM_PAGE_TYPE].count - a.recent[ROOM_PAGE_TYPE].count)

/**
 * Whether a commune × typology is published as a page — drives the links to it.
 *
 * A commune can qualify on one typology and not its neighbour, which is the
 * point: the page exists where the sample holds it up, and the reader is told
 * how many sales it rests on. Sibling links and the hub tables read this, so a
 * link is never offered to a page that was not built.
 */
export const hasRoomPage = (commune, rooms) => {
  if (!PAGE_ROOMS.includes(rooms)) return false
  const cell = roomCell(commune, rooms)
  return Boolean(cell && cell.count >= MIN_CELL_SALES)
}

export const roomPagePath = (commune, rooms) =>
  `/prix-appartement-${rooms}-pieces-${commune.slug}`

/** Every published commune × typology, largest market first. */
export const roomPages = selectedCommunes.flatMap((commune) =>
  PAGE_ROOMS.filter((rooms) => hasRoomPage(commune, rooms)).map((rooms) => ({
    commune,
    rooms,
    cell: roomCell(commune, rooms),
  }))
)

/**
 * The typology's five-year series, in the shape the chart and its table already
 * read — `entry[type]`, the same as `commune.yearly`. Reshaping here rather than
 * teaching two components a second layout keeps the accessible twin of the chart
 * accessible by construction.
 *
 * Years below MIN_SERIES_SALES are kept as rows and emptied, rather than dropped:
 * the table renders them as « — » and the chart breaks its path across them,
 * which is what both already do for a missing year. Dropping the row instead
 * would leave a reader counting 2021, 2023, 2024 and wondering what happened to
 * the year in between.
 *
 * Returns null when fewer than three years survive: two points are a delta, not
 * a trend, and the delta is already stated in prose.
 */
export const roomSeries = (cell, type = ROOM_PAGE_TYPE) => {
  if (!cell?.yearly) return null

  const entries = cell.yearly.map((entry) => ({
    year: entry.year,
    ...(entry.count >= MIN_SERIES_SALES
      ? {
          [type]: {
            count: entry.count,
            pricePerSqm: entry.pricePerSqm,
            medianPrice: entry.medianPrice,
          },
        }
      : {}),
  }))

  return entries.filter((entry) => entry[type]).length >= 3 ? entries : null
}

/** The bar a year has to clear to be plotted, restated for the chart's footnote. */
export const ROOM_SERIES_MIN_SALES = MIN_SERIES_SALES

/**
 * Relative change of the typology's median price per sqm over `span` years,
 * walking back from its own latest usable year. Mirrors `evolution` in
 * communes.js, which cannot be reused as it reads the commune-level series.
 *
 * Both endpoints have to clear MIN_SERIES_SALES on their own — subtracting two
 * medians is where a thin year does the most damage, and the span is fixed, so
 * a year that falls short ends the comparison rather than shifting it.
 */
export const roomEvolution = (cell, span, type = ROOM_PAGE_TYPE) => {
  const series = roomSeries(cell, type)
  if (!series) return null

  const usable = series.filter((entry) => entry[type])
  const to = usable.at(-1)
  const from = usable.find((entry) => entry.year === to.year - span)
  if (!from) return null

  return {
    from: from.year,
    to: to.year,
    ratio: to[type].pricePerSqm / from[type].pricePerSqm - 1,
  }
}

/**
 * What moving up or down one typology costs in this commune, in euros of median
 * price.
 *
 * The step is not the same on both sides and not the same across communes —
 * in Montreuil the T2 → T3 step costs +103 000 € and the T3 → T4 step +67 000 €
 * — which is the whole point of stating it. Both neighbours are read from the
 * full room table, not from PAGE_ROOMS: a T4 page can name the T5 step even
 * where the T5 has no page of its own, as long as the cell clears the bar it
 * would need to be published at all.
 */
export const roomSteps = (commune, rooms, type = ROOM_PAGE_TYPE) => {
  const here = roomCell(commune, rooms, type)
  if (!here) return []

  return [rooms - 1, rooms + 1]
    .map((other) => {
      const cell = roomCell(commune, other, type)
      if (!cell || cell.count < MIN_PEER_SALES) return null
      return {
        rooms: other,
        cell,
        delta: cell.medianPrice - here.medianPrice,
        hasPage: hasRoomPage(commune, other),
      }
    })
    .filter(Boolean)
}

/**
 * Where the commune sits among its department on this typology, plus the list it
 * sits in. Returns null when the department has too few published cells to place
 * anything.
 *
 * The list is capped and centred on the commune the way `comparables` centres
 * its window: an alphabetical or a top-N list would be the same list on every
 * page of the department, which is how the commune pages ended up with a single
 * inbound link each before that was fixed.
 */
export const roomRanking = (commune, rooms, type = ROOM_PAGE_TYPE, limit = 8) => {
  const here = roomCell(commune, rooms, type)
  if (!here) return null

  const peers = communes.filter((other) => {
    if (other.department.code !== commune.department.code) return false
    const cell = roomCell(other, rooms, type)
    return Boolean(cell && cell.count >= MIN_PEER_SALES)
  })
  if (peers.length < MIN_PEERS + 1) return null

  const price = (entry) => roomCell(entry, rooms, type).pricePerSqm
  const sorted = [...peers].sort((a, b) => price(b) - price(a))
  const index = sorted.findIndex((entry) => entry.code === commune.code)

  let start = Math.max(0, index - Math.floor(limit / 2))
  let end = start + limit + 1
  if (end > sorted.length) {
    end = sorted.length
    start = Math.max(0, end - limit - 1)
  }

  // The commune sitting in the middle of the department's list, and explicitly
  // not « the department's median T3 »: this is the median of a few dozen
  // commune medians, which is a different quantity from the median of the
  // department's sales and would be a smaller number in a department where the
  // cheap communes trade the most. The prose that uses it says so.
  const middle = roomCell(sorted[Math.floor((sorted.length - 1) / 2)], rooms, type)

  return {
    rank: index + 1,
    total: sorted.length,
    middle,
    /** Gap to that middle commune, or null when this commune is it. */
    gapToMiddle: middle.pricePerSqm ? here.pricePerSqm / middle.pricePerSqm - 1 : null,
    window: sorted.slice(start, end).map((entry) => ({
      commune: entry,
      cell: roomCell(entry, rooms, type),
      isSelf: entry.code === commune.code,
      href: hasRoomPage(entry, rooms)
        ? roomPagePath(entry, rooms)
        : `/prix-immobilier-${entry.slug}`,
    })),
  }
}

/**
 * Share of the commune's apartment sales this typology accounts for.
 *
 * Measured against `recent[type].count`, the commune's whole apartment market,
 * rather than against the sum of the room cells: cells below the aggregate's own
 * 10-sale floor are missing from that sum, so it would quietly inflate every
 * share by whatever the tail weighed.
 */
export const roomShare = (commune, rooms, type = ROOM_PAGE_TYPE) => {
  const cell = roomCell(commune, rooms, type)
  const total = commune.recent[type]?.count
  return cell && total ? cell.count / total : null
}

/**
 * Every commune publishing this typology, dearest first — the hub pages' table.
 *
 * Drawn from the same selection as the pages themselves, so the hub is a table
 * of contents rather than a ranking with dead rows: every line links to a page
 * that exists.
 */
export const roomLeaderboard = (rooms, type = ROOM_PAGE_TYPE) =>
  roomPages
    .filter((page) => page.rooms === rooms)
    .map(({ commune, cell }) => ({ commune, cell, href: roomPagePath(commune, rooms) }))
    .sort((a, b) => b.cell.pricePerSqm - a.cell.pricePerSqm)

/**
 * The hub pages — one per typology, listing every commune that publishes it.
 *
 * They exist as much for the link graph as for the reader: without them the 149
 * detail pages are reachable only from the 50 commune pages that carry a link
 * each, and nothing on the site collects them. `prix-t3` rather than the detail
 * pages' `prix-appartement-3-pieces` prefix so the two route families cannot
 * overlap — the detail route matches a whole opaque tail.
 */
export const roomHubPath = (rooms) => `/prix-t${rooms}-par-ville`

/** Typologies with something to list. Empty leaderboards get no page. */
export const roomHubs = PAGE_ROOMS.filter((rooms) => roomLeaderboard(rooms).length > 0)

const middleOf = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

/**
 * What this typology looks like across the communes that publish it — the middle
 * commune's floor area and price per sqm.
 *
 * Lets a page say whether its own T3 is a small one or a large one, which is the
 * question the surface figure raises and which no single page can answer alone.
 * It is the middle of fifty commune medians over the largest markets, not a
 * national median; the prose that uses it says so.
 */
export const roomBenchmark = (rooms, type = ROOM_PAGE_TYPE) => {
  const board = roomLeaderboard(rooms, type)
  if (!board.length) return null
  return {
    communes: board.length,
    medianArea: middleOf(board.map((entry) => entry.cell.medianArea)),
    pricePerSqm: middleOf(board.map((entry) => entry.cell.pricePerSqm)),
  }
}
