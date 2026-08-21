// Facts about the DVF release the site is built from. Single source for the
// footer, the sitemap's lastmod and the Dataset markup, so they can never drift
// apart. Update all of it here when the ETL is re-run against a new release.

export const DATASET = {
  /** Publication date of the DVF release, and therefore of every figure. */
  releaseDate: '2026-04-01',
  /**
   * When the pages last changed for a reason other than the data — new page
   * types, rewritten copy, markup fixes.
   *
   * Bump it by hand, and only when the change is one a reader would notice.
   * Deriving it from the build would put a fresh date on every deploy including
   * the ones that change nothing, which is exactly the signal that teaches a
   * crawler to stop believing `lastmod`.
   */
  contentUpdated: '2026-08-21',
  /** Last day covered by the data. */
  coverageEnd: '31 décembre 2025',
  firstYear: 2021,
  lastYear: 2025,
  sourceUrl: 'https://www.data.gouv.fr/datasets/demandes-de-valeurs-foncieres-geolocalisees',
  licenseUrl: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
  siteName: 'donnees-immo.fr',
}

/**
 * What the sitemap reports as `lastmod`: the later of the two dates above.
 *
 * The release date alone was right while the pages were a pure function of the
 * data — a rebuild that changed nothing had no business claiming freshness. It
 * stopped being right once the templates started changing on their own: 945
 * pages were added and 3 887 rewritten under a `lastmod` still reading 1 April,
 * so a crawler was told nothing had moved.
 *
 * Both are ISO dates, which sort as strings.
 *
 * This is deliberately not the Dataset's `dateModified`, which stays on the
 * release: the medians did not change when the wording around them did.
 */
export const LAST_MODIFIED =
  DATASET.contentUpdated > DATASET.releaseDate ? DATASET.contentUpdated : DATASET.releaseDate

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
 * The site as an entity, distinct from both the editor who computes the figures
 * and DGFiP who produced the transactions. Three roles, three properties:
 * `creator` for whoever did the computing, `publisher` for the site that puts
 * them out, `isBasedOn` for the source.
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
 * Who computed the medians this page describes.
 *
 * The editor, not DGFiP — this used to name the administration and that was
 * wrong. The Dataset described by a page here is the aggregate: the medians,
 * the deciles, the series. DGFiP produced the transactions those are computed
 * from, which is a different dataset, named below in `basedOn`. Crediting the
 * administration with `creator` claims it published figures it never published,
 * and contradicted llms.txt, which says so in as many words.
 *
 * `Person` rather than the site Organization, which stays as `publisher`: the
 * author/publisher split is the standard reading, and behind these figures
 * there is one identifiable individual.
 */
export const creator = {
  '@type': 'Person',
  name: EDITOR.name,
  url: EDITOR.contact,
  sameAs: [EDITOR.contact],
}

/**
 * The source dataset, as an entity rather than a bare URL, so DGFiP is named in
 * the markup as what it actually is: the creator of the transactions, not of
 * the medians derived from them.
 *
 * `Organization` and not the more precise `GovernmentOrganization`: Google's
 * Dataset parser accepts only Organization or Person for `creator` and warned
 * on every page of the site until this was changed. The name carries the
 * precision the type used to.
 *
 * It carries a `description` for the same reason it carries a type: nested in
 * `isBasedOn` or not, Google reads this as a Dataset item of its own and wants
 * every required field on it. Without one, the source node raised a
 * `description` warning on all 4 675 pages at once — the figures were never in
 * question, only the node describing where they come from.
 */
export const basedOn = {
  '@type': 'Dataset',
  name: 'Demandes de valeurs foncières géolocalisées',
  description: `Les mutations immobilières enregistrées par l'administration fiscale, géolocalisées à la parcelle et publiées en open data par Etalab. Millésime couvrant les ventes de ${DATASET.firstYear} à ${DATASET.lastYear}.`,
  url: DATASET.sourceUrl,
  license: DATASET.licenseUrl,
  creator: {
    '@type': 'Organization',
    name: 'Direction générale des finances publiques (DGFiP)',
  },
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
