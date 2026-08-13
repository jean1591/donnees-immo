// Facts about the DVF release the site is built from. Single source for the
// footer, the sitemap's lastmod and the Dataset markup, so they can never drift
// apart. Update all of it here when the ETL is re-run against a new release.

export const DATASET = {
  /** Publication date of the DVF release, and therefore of every page. */
  releaseDate: '2026-04-01',
  /** Last day covered by the data. */
  coverageEnd: '31 décembre 2025',
  firstYear: 2021,
  lastYear: 2025,
  sourceUrl: 'https://www.data.gouv.fr/datasets/demandes-de-valeurs-foncieres-geolocalisees',
  licenseUrl: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
  siteName: 'donnees-immo.fr',
}

/**
 * The 24-month headline window, named rather than described.
 *
 * « ces deux dernières années » is true on the day the dataset ships and drifts
 * for the six months the pages then sit unchanged: a visitor in June reads it as
 * the two years ending that month, which is not the window the median was
 * computed over. Naming the months costs four words and makes the figure
 * quotable — by a reader, and by a model that has to date what it cites.
 *
 * Derived from `lastYear` so it cannot fall out of step with the ETL, whose
 * filter is `annee >= lastYear - 1`.
 */
export const RECENT_WINDOW = {
  firstYear: DATASET.lastYear - 1,
  lastYear: DATASET.lastYear,
  /** « de janvier 2024 à décembre 2025 » */
  prose: `de janvier ${DATASET.lastYear - 1} à décembre ${DATASET.lastYear}`,
  /** « entre janvier 2024 et décembre 2025 » */
  between: `entre janvier ${DATASET.lastYear - 1} et décembre ${DATASET.lastYear}`,
}
