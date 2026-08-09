// Department-level views over the commune dataset.
//
// Note: no department-wide median is published. Deriving one from commune
// medians would be a median of medians, which is the same mistake as averaging
// arrondissement medians. Publishing one needs an `agg_departement` table in
// 03-aggregate.sql, computed from `ventes`.

import { allCommunes } from './communes.js'

export const departments = [
  ...allCommunes
    .reduce((map, commune) => {
      const entry = map.get(commune.department.code) ?? {
        ...commune.department,
        communes: [],
      }
      // Arrondissements are listed on their city page, not in the department
      // roll-up, where they would bury every other commune.
      if (commune.kind !== 'arrondissement') entry.communes.push(commune)
      map.set(commune.department.code, entry)
      return map
    }, new Map())
    .values(),
]
  .map((entry) => ({
    ...entry,
    communes: entry.communes.sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  }))
  .sort((a, b) => a.code.localeCompare(b.code))

export const departmentBySlug = new Map(departments.map((entry) => [entry.slug, entry]))
