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
 * The site as an entity, distinct from DGFiP: DGFiP produced the transactions,
 * donnees-immo.fr computes and publishes the medians. Both belong in the
 * markup — `creator` for the source, `publisher` for whoever stands behind the
 * figure — and conflating them would credit the administration with numbers it
 * never published.
 *
 * No `sameAs`: the site has no profile anywhere to point at. The property
 * exists to tie an entity to its known accounts, and inventing one would state
 * something false to satisfy a checklist.
 */
export const publisher = (site) => ({
  '@type': 'Organization',
  name: DATASET.siteName,
  url: new URL('/', site).href,
  logo: new URL('/favicon.svg', site).href,
})

/**
 * A named place, with coordinates when the export carries them — the median
 * location of the area's own sales, four decimals. Two communes out of 3 630
 * have none: DVF geolocates neither, and a Place without `geo` is still valid
 * markup, where invented coordinates would not be.
 */
export const place = (name, geo) => ({
  '@type': 'Place',
  name,
  ...(geo
    ? { geo: { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lon } }
    : {}),
})

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
