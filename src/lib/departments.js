// Department-level views over the commune dataset.
//
// Note: no department-wide median is published. Deriving one from commune
// medians would be a median of medians, which is the same mistake as averaging
// arrondissement medians. Publishing one needs an `agg_departement` table in
// 03-aggregate.sql, computed from `ventes`.

import { allCommunes, publishedTypes } from './communes.js'

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
