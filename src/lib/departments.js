// Department-level views over the commune dataset.
//
// The department's own medians come from data/departements-agg.json, which the
// ETL recomputes from `ventes` — never derived from the commune medians below,
// which would be a median of medians, the same mistake as averaging
// arrondissement medians. They also rest on a wider base than the pages they sit
// above: every sale of the department counts, including those of the communes
// too small to be published. Anything quoting them says so.

import areas from '../../data/departements-agg.json'
import { allCommunes, publishedTypes, TYPES } from './communes.js'

/** France as a whole, same shape as a department: `recent` and `yearly`. */
export const national = areas.national

export const departments = [
  ...allCommunes
    .reduce((map, commune) => {
      const entry = map.get(commune.department.code) ?? {
        ...commune.department,
        communes: [],
        districts: [],
      }
      // Arrondissements stay out of `communes`, where they would bury every
      // other entry and skew the rankings built from it. They get their own
      // list instead: without it the Paris department page held a single row,
      // pointing at the city it is named after.
      if (commune.kind === 'arrondissement') entry.districts.push(commune)
      else entry.communes.push(commune)
      map.set(commune.department.code, entry)
      return map
    }, new Map())
    .values(),
]
  .map((entry) => ({
    ...entry,
    // `recent` and `yearly` give a department the shape of a commune, so the
    // tiles, the chart and `evolution()` read it without a second code path.
    recent: areas.departments[entry.code]?.recent ?? { apartment: {}, house: {} },
    yearly: areas.departments[entry.code]?.yearly ?? [],
    communes: entry.communes.sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    districts: entry.districts.sort((a, b) => a.code.localeCompare(b.code)),
    // Sales behind the department's published medians, over 24 months. Summing
    // the communes is exact here rather than an approximation: each sale counts
    // once, in the commune that recorded it. Arrondissements are already out of
    // `communes`, so Paris contributes its own figure and not twice.
    sales: entry.communes.reduce(
      (total, commune) =>
        total +
        publishedTypes(commune).reduce((sum, type) => sum + commune.recent[type].count, 0),
      0
    ),
  }))
  .sort((a, b) => a.code.localeCompare(b.code))

export const departmentBySlug = new Map(departments.map((entry) => [entry.slug, entry]))

// National rank, dearest first, computed once per property type. Every
// department publishes both types, so the denominator is the same on all 97
// pages — no ranking is drawn from a partial field.
const rankings = Object.fromEntries(
  TYPES.map((type) => [
    type,
    departments
      .filter((entry) => entry.recent[type]?.pricePerSqm)
      .sort((a, b) => b.recent[type].pricePerSqm - a.recent[type].pricePerSqm)
      .map((entry) => entry.code),
  ])
)

/** Where a department sits nationally on one type: `{ rank, total }` or null. */
export const departmentRank = (code, type) => {
  const order = rankings[type] ?? []
  const index = order.indexOf(code)
  return index === -1 ? null : { rank: index + 1, total: order.length }
}

/** Relative gap between a median price per sqm and the national one. */
export const gapToNational = (block, type) =>
  block?.pricePerSqm && national.recent[type]?.pricePerSqm
    ? block.pricePerSqm / national.recent[type].pricePerSqm - 1
    : null
