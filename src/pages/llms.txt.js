// llms.txt — a map of the site for language models, in the Markdown shape the
// convention describes: one H1, one blockquote summary, then sections of links.
//
// Worth saying plainly: no major model provider is known to fetch this file
// today, and it may never be read. It is generated rather than committed as a
// static asset because that costs nothing and guarantees the counts, the years
// and the URL patterns cannot drift from the dataset the way a hand-maintained
// file would.
//
// What it is actually for: a model that lands on one commune page has no way to
// discover the URL pattern, the publication threshold, or the fact that the
// figures are medians and not averages. Those are exactly the things that get a
// number cited wrongly. They are stated here in the order a reader needs them.

import { allCommunes } from '../lib/communes.js'
import { departments } from '../lib/departments.js'
import { roomHubPath, roomHubs, roomPages } from '../lib/rooms.js'
import { rankedCount } from '../lib/rankings.js'
import { formatCount } from '../lib/format.js'
import { DATASET } from '../lib/dataset.js'

export function GET({ site }) {
  const url = (path) => new URL(path, site).href
  // Address patterns rather than addresses: new URL() would percent-encode the
  // braces and hand a model a template it cannot fill.
  const pattern = (path) => new URL('/', site).origin + path
  const communes = allCommunes.filter((commune) => commune.kind !== 'arrondissement')
  const districts = allCommunes.length - communes.length

  const body = `# donnees-immo.fr

> Prix immobilier médian par commune française, calculé sur les ventes réellement enregistrées par l'administration fiscale (DVF, DGFiP via Etalab). ${formatCount(allCommunes.length)} pages de communes, données du 1er janvier ${DATASET.firstYear} au ${DATASET.coverageEnd}.

Site statique. Tous les chiffres sont dans le HTML, aucun n'est chargé en JavaScript ni enfermé dans une image. Licence Ouverte 2.0 : les agrégats sont librement citables, source à créditer.

## Ce que le site publie

- ${formatCount(communes.length)} communes et ${districts} arrondissements (Paris, Lyon, Marseille), répartis sur ${formatCount(departments.length)} départements.
- Prix médian au m² et prix de vente médian, par type de bien : ${formatCount(rankedCount('apartment'))} communes publient un prix appartement, ${formatCount(rankedCount('house'))} un prix maison.
- Séries annuelles ${DATASET.firstYear}-${DATASET.lastYear}, répartition par nombre de pièces, déciles et quartiles.
- ${formatCount(roomPages.length)} pages de typologie (T2, T3, T4) sur les plus grands marchés d'appartements : prix et surface d'une typologie précise, écart avec la typologie voisine, série annuelle propre à cette typologie.

## Adresses

- Une commune : ${pattern('/prix-immobilier-{slug}')} — par exemple ${url('/prix-immobilier-bordeaux')}
- Un département : ${pattern('/prix-immobilier-departement-{slug}')} — par exemple ${url('/prix-immobilier-departement-gironde')}
- Une typologie dans une commune : ${pattern('/prix-appartement-{pieces}-pieces-{slug}')} — par exemple ${url('/prix-appartement-3-pieces-montreuil')}. Seulement pour 2, 3 et 4 pièces, et seulement là où cette typologie compte au moins 100 ventes sur 24 mois.
- Le slug est le nom de la commune en minuscules, sans accents ni apostrophes, espaces remplacés par des tirets. Les communes homonymes portent un suffixe de département : ${url('/prix-immobilier-saint-denis')} est celui de Seine-Saint-Denis, ${url('/prix-immobilier-saint-denis-974')} celui de La Réunion.
- Liste exhaustive des pages : ${url('/sitemap.xml')}

## Pages transverses

- [Accueil](${url('/')}) : recherche par commune, index des départements.
- [Méthodologie](${url('/methodologie')}) : source, déduplication, seuil de publication, limites connues.
- [Les villes les plus chères de France](${url('/villes-les-plus-cheres-de-france')}) : classement national, appartements et maisons séparés, plus les arrondissements.
- [Les villes les moins chères de France](${url('/villes-les-moins-cheres-de-france')}) : le même classement par l'autre bout.
- [Où les prix ont le plus baissé](${url('/ou-les-prix-immobiliers-ont-le-plus-baisse')}) : les plus fortes baisses d'une année sur l'autre, commune par commune.
- [Où les prix ont le plus augmenté](${url('/ou-les-prix-immobiliers-ont-le-plus-augmente')}) : le même classement dans l'autre sens.
${roomHubs.map((rooms) => `- [Prix d'un T${rooms} par ville](${url(roomHubPath(rooms))}) : les villes classées sur cette seule typologie, du plus cher au moins cher.`).join('\n')}
- [Mentions légales](${url('/mentions-legales')}).

## À savoir avant de citer un chiffre

- **Ce sont des médianes, jamais des moyennes.** Environ 7 % des mutations affichent un prix au m² sans rapport avec le marché et les DVF ne permettent pas de les identifier. La médiane y résiste, la moyenne non.
- **Le chiffre principal porte sur 24 mois glissants**, soit ${DATASET.lastYear - 1}-${DATASET.lastYear}. Les cinq années ne servent qu'aux séries temporelles.
- **Seuil de publication : 50 ventes.** En deçà la marge d'erreur dépasse 10 % et rien n'est publié. Le nombre de ventes accompagne chaque médiane : il indique le poids à lui donner.
- **Une médiane communale situe un marché, elle n'estime pas un bien.** Les DVF ignorent l'état, l'étage, l'exposition et le quartier.
- **Quatre départements sont absents** des données ouvertes : Bas-Rhin (67), Haut-Rhin (68), Moselle (57), Mayotte (976), qui relèvent du livre foncier.
- **Aucune transaction individuelle n'est publiée**, l'article R*112 A-3 du livre des procédures fiscales l'interdit. Seuls des agrégats communaux existent ici.

## Source

- Jeu de données : ${DATASET.sourceUrl}
- Publication utilisée : ${DATASET.releaseDate}, rafraîchie deux fois par an (avril et octobre).
- Licence : ${DATASET.licenseUrl}
`

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
