// Lookup index for the homepage search box, fetched on first interaction
// rather than inlined: 3630 entries would roughly double the landing page's
// HTML for a feature most visitors reach through a link instead.
//
// Keys are one letter to keep the payload small — this is a wire format, not
// an API. `q` is the accent-free lowercase form the client matches against, so
// the browser never has to normalise 3630 strings on every keystroke.

import { allCommunes } from '../lib/communes.js'
import { publishedTypes } from '../lib/communes.js'

const searchable = (name) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export function GET() {
  const index = allCommunes.map((commune) => ({
    n: commune.name,
    s: commune.slug,
    d: commune.department.code,
    q: searchable(commune.name),
    p: commune.recent[publishedTypes(commune)[0]].pricePerSqm,
  }))

  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
