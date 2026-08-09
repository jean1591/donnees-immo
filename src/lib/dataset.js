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
