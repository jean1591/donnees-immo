// Lookup index for the homepage search box, fetched on first interaction
// rather than inlined: 3630 entries would roughly double the landing page's
// HTML for a feature most visitors reach through a link instead.
//
// Keys are one letter to keep the payload small — this is a wire format, not
// an API. `q` is the accent-free lowercase form the client matches against, so
// the browser never has to normalise 3630 strings on every keystroke.

import { allCommunes } from '../lib/communes.js'
import { publishedTypes } from '../lib/communes.js'

/**
 * Separators are dropped entirely rather than normalised to spaces, so
 * « saint denis », « saint-denis » and « saintdenis » all reduce to the same
 * key. Hyphens and apostrophes are everywhere in French commune names and
 * nobody types them reliably.
 */
const searchable = (name) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

export function GET() {
  const index = allCommunes.map((commune) => {
    const types = publishedTypes(commune)
    return {
      n: commune.name,
      s: commune.slug,
      d: commune.department.code,
      q: searchable(commune.name),
      p: commune.recent[types[0]].pricePerSqm,
      // Sale volume, used only to rank equally good matches: on "saint-denis"
      // it puts the two big Saint-Denis above Saint-Denis-lès-Bourg.
      v: types.reduce((sum, type) => sum + commune.recent[type].count, 0),
    }
  })

  // Cached forever, because the URL carries the release date: the homepage
  // requests `?v=<releaseDate>`, so a new dataset is a new URL. A plain
  // max-age would leave browsers holding a stale index after a refresh —
  // the fetch fires on focus, long after the document loads, so a hard reload
  // does not clear it.
  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
