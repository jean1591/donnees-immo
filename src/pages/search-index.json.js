// Lookup index for the homepage search box, fetched on first interaction
// rather than inlined: 3630 entries would roughly double the landing page's
// HTML for a feature most visitors reach through a link instead.
//
// Keys are one letter to keep the payload small — this is a wire format, not
// an API. `q` is the accent-free lowercase form the client matches against, so
// the browser never has to normalise 3630 strings on every keystroke.

import { allCommunes } from '../lib/communes.js'
import { publishedTypes } from '../lib/communes.js'
import { ROOM_PAGE_TYPE, roomPagePath, roomPages } from '../lib/rooms.js'
import { roomLabel } from '../lib/format.js'

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

  // Typology pages, so « T3 Bordeaux » from the homepage lands on the page that
  // answers it rather than on the commune and a table to scroll.
  //
  // Two keys because word order is not something anyone gets right on purpose:
  // `q` matches « t3bordeaux », `a` matches « bordeauxt3 ». `u` carries the
  // address, since these are the only entries not built from the commune
  // pattern. Their `v` is the cell's own sale count, an order of magnitude below
  // a commune total, which keeps them under the commune itself on a bare name.
  const typologies = roomPages.map(({ commune, rooms, cell }) => {
    const label = roomLabel(rooms, ROOM_PAGE_TYPE)
    return {
      n: `${label} ${commune.name}`,
      s: commune.slug,
      u: roomPagePath(commune, rooms),
      d: commune.department.code,
      q: searchable(`${label}${commune.name}`),
      a: searchable(`${commune.name}${label}`),
      p: cell.pricePerSqm,
      v: cell.count,
    }
  })

  index.push(...typologies)

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
