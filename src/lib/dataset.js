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
 * Whoever stands behind the figures, named. The legal notice already carries
 * this — the constant exists so the page and the markup say the same thing.
 *
 * `contact` is a LinkedIn profile rather than a mailbox on purpose: it is how a
 * reader checks who publishes this, not only how they write to them, and an
 * address on a static page collects more spam than mail.
 */
export const EDITOR = {
  name: 'Jean Robertou',
  contact: 'https://www.linkedin.com/in/robertoujean/',
}

/**
 * The site as an entity, distinct from DGFiP: DGFiP produced the transactions,
 * donnees-immo.fr computes and publishes the medians. Both belong in the
 * markup — `creator` for the source, `publisher` for whoever stands behind the
 * figure — and conflating them would credit the administration with numbers it
 * never published.
 *
 * The organisation carries a `founder`, and the person carries the `sameAs`:
 * behind this site there is one identifiable individual, not a newsroom, and
 * saying so is the whole point. A figure that can be traced to someone who put
 * their name on it is citable in a way an anonymous domain is not — which is
 * what the site is betting on against competitors publishing unsourced
 * estimates.
 */
export const publisher = (site) => ({
  '@type': 'Organization',
  name: DATASET.siteName,
  url: new URL('/', site).href,
  logo: new URL('/favicon.svg', site).href,
  founder: {
    '@type': 'Person',
    name: EDITOR.name,
    url: EDITOR.contact,
    sameAs: [EDITOR.contact],
  },
})

/**
 * Who produced the transactions the medians are computed from.
 *
 * `Organization` rather than the `GovernmentOrganization` this used to carry.
 * The narrower type is valid schema.org and describes DGFiP more precisely, but
 * Google's Dataset parser only accepts `Organization` or `Person` for `creator`
 * and flags anything else — the URL inspection API reported the warning on
 * every page of the site. Precision nobody consumes is worth less than markup
 * that validates, and the name still says which administration it is.
 */
export const creator = {
  '@type': 'Organization',
  name: 'Direction générale des finances publiques (DGFiP)',
}

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
