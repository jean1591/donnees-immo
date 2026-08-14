# donnees-immo.fr

Static site publishing French real-estate price aggregates, built on DVF
(Demandes de Valeurs Foncières), the transaction dataset released by the French
tax administration (DGFiP).

## Goal

Publish one page per commune with median price per m², transaction volumes and
trends, based on **actual recorded sales** — not estimates. Target: SEO long
tail on "prix immobilier [commune]" queries. Free access, no monetisation at
launch.

The developer makes the calls. Propose options and explain trade-offs; do not
introduce solutions he did not ask for.

## Current state

- SQL ETL complete (`etl/01` through `etl/03`), aggregate tables built in `dvf.db`
- Remaining: `etl/export.mjs`, Astro init, templates, deployment

## Stack

- **DuckDB** for the ETL (local only, never deployed)
- **Astro** as SSG — chosen after ruling out Next.js and Vite CSR; SEO requires
  prerendered HTML
- **Tailwind**
- Hosting: VPS (nginx/certbot already familiar, Caddy to evaluate) or Cloudflare
  Pages — undecided. Note Cloudflare Pages caps at 20,000 files per deployment.

## Layout

```
donnees-immo/
├── etl/
│   ├── dvf.db              # DuckDB database ~1 GB (gitignored)
│   ├── dvf.csv.gz          # raw source, 499 MB (gitignored)
│   ├── 01-load.sql         # CSV → dvf table (already run)
│   ├── 02-mutations.sql    # deduplication → mutations, ventes tables
│   ├── 03-aggregate.sql    # → agg_recent, agg_annuel, agg_pieces + _villes
│   └── export.mjs          # tables → data/communes.json   [TO WRITE]
├── data/
│   ├── departements.json   # code → name + slug (provided, 101 entries)
│   ├── homonymes.json      # arbitration for the 53 slug collisions  [TO GENERATE]
│   ├── departements-agg.json # ETL output: department + national medians
│   └── communes.json       # ETL output, committed to git
├── src/
│   ├── pages/
│   ├── components/
│   ├── layouts/
│   └── lib/{slug.js,format.js}
├── scripts/
│   ├── og-card.mjs         # renders public/og.png via headless Chrome
│   ├── favicon.mjs         # renders public/favicon.ico from favicon.svg
│   ├── indexnow.mjs        # pings IndexNow with the built sitemap
│   └── verify.mjs          # blocking checks over dist/ (`npm run verify`)
└── public/{robots.txt,og.png,favicon.*,_headers,_redirects}
```

`data/communes.json` is **committed**: the build must run without the DuckDB
database. The ETL only runs twice a year, locally.

`public/og.png` is committed for the same reason, and states the commune count,
so it is regenerated in the same pass. The twice-yearly ritual is:

```
npm run export && npm run og && npm run build && npm run verify
git commit && git push          # Cloudflare builds and deploys from main
npm run indexnow                # after the deploy, never before
```

`npm run favicon` is not part of it — only re-run it if `favicon.svg` changes.

## Data source

"Demandes de valeurs foncières géolocalisées" (Etalab, derived from DGFiP):
https://www.data.gouv.fr/datasets/demandes-de-valeurs-foncieres-geolocalisees

- April 2026 release, covering **2021-01-01 → 2025-12-31**
- 20,382,915 rows, 7,319,609 mutations
- Refreshed twice a year (April and October)
- **Missing départements**: Bas-Rhin (67), Haut-Rhin (68), Moselle (57),
  Mayotte (976) — flagged `absent_dvf` in `departements.json`
- No 2026 data; Q4 2025 is complete (verified)

### Loading gotchas (already handled in 01-load.sql)

- DuckDB's sniffer fails to detect quoting → `quote='"'` is mandatory, otherwise
  addresses containing a comma break the parse
- `lot1_numero`..`lot5_numero` sometimes hold letters → force VARCHAR
- INSEE codes, postcodes, département codes: **VARCHAR is mandatory** (leading
  zeros, Corsica 2A/2B)
- Real column names are `lot1_numero`, not `lot_1_numero` as the data.gouv docs
  claim — trust the file, not the documentation

## Established domain rules (do not reinvent)

### Deduplication

One mutation spans several rows (2.8 on average). **Always group by
`id_mutation` before any computation.** `id_mutation` is not stable across
releases — never use it as a persistent key.

### Counting properties

Count **primary dwellings only** (`type_local IN ('Maison', 'Appartement')`),
ignoring outbuildings and parking spaces. An apartment almost always sells
alongside a cellar or a parking space, so the naive "single property row" filter
drops 79 % of apartments (402 k instead of 1.9 M).

Working base: `n_principaux = 1` → **4,017,007 usable sales** (2.1 M houses,
1.9 M apartments).

### Outliers

~6.8 % of mutations have a price/m² unrepresentative of the market (split
ownership, sales between related parties, derelict properties, multi-lot deals).
**DVF cannot identify them** — it carries neither property condition nor the
relationship between parties. The "attached farmland" and "single property split
across parcels" hypotheses were both tested and ruled out.

**The median is robust to these outliers**: trimming extreme percentiles does
not move the commune median by a single euro (verified on Bordeaux and Guéret).
So no heavy cleaning is needed as long as only medians are published. Filtering
would become necessary for means or min/max.

### Time window

The headline figure covers **24 months (2024-2025)**, explicitly labelled "over
the last 24 months". Aggregating all five years would blend the post-Covid peak
with the 2024 trough — the resulting number matches no real market.

The five-year span is used only for the time series and structural breakdowns
(median floor area, house/apartment split).

### Publication thresholds

Measured margin of error on the median (decays as 1/√n):

| sales   | apartment | house  |
| ------- | --------- | ------ |
| 20-29   | 13.7 %    | 19.9 % |
| 50-99   | 8.0 %     | 9.1 %  |
| 100-199 | 5.7 %     | 6.3 %  |
| 200-499 | 3.9 %     | 4.4 %  |

Communes clearing each threshold over the 24-month window: 787 at ≥200,
1,751 at ≥100, 3,627 at ≥50, 8,334 at ≥20.

**Threshold chosen: 50** (3,627 pages). Below that the margin exceeds 10 % and
the figures are not defensible. Always display the sale count next to every
median.

## Legal constraints

Article R\*112 A-3 of the French tax procedure code sets two prohibitions:

1. **No re-identification** of the individuals involved, not even indirectly
2. **No search-engine indexing of the mutation records themselves**

Commune-level aggregates are not personal data, so they are freely indexable.
The restriction targets individual transactions.

**Practical consequences**: no per-sale page, no exposure of individual
transactions, `noindex` if unit-level data is ever published. Suppress cells
below the sample threshold (a "median" over 3 sales effectively discloses one
transaction).

Credit DGFiP as the source under Licence Ouverte 2.0. Legal notice page needed.

## URLs and slugs

Flat, long-tail oriented:

- `/prix-immobilier-bordeaux`
- `/prix-immobilier-bordeaux-evolution` (not "historique")
- `/prix-immobilier-bordeaux-2025` (year as a suffix, never as a path segment)
- `/prix-appartement-3-pieces-bordeaux` — one apartment typology in one commune.
  T2, T3 and T4 only, and only where the cell holds 100 sales over 24 months, in
  the 50 largest apartment markets. Houses are excluded: room count is not how a
  house is shopped. Selection lives in `src/lib/rooms.js`.
- `/prix-t3-par-ville` — the hub listing every commune publishing that typology.
  Deliberately not `prix-appartement-3-pieces-par-ville`: the page above matches
  its whole URL tail, so the two route families must not share a prefix.

Slugification: lowercase, strip accents, apostrophes and spaces → hyphens
(`L'Haÿ-les-Roses` → `l-hay-les-roses`).

### Name collisions

53 communes share a slug (out of 5,520). Rule: **append the département code
unless explicitly arbitrated** in `data/homonymes.json`, frozen once and for all
— never recompute it dynamically, since a new release could flip the assignment
and break indexed URLs.

Obvious arbitrations to include: `valence`→26, `saint-denis`→93,
`saint-nazaire`→44, `chatillon`→92, `langon`→33.

### Paris / Lyon / Marseille

DVF only contains **arrondissements** (`75101-75120`, `69381-69389`,
`13201-13216`). City-level entries are rebuilt in the `*_villes` tables under
codes `75056`, `69123`, `13055`.

**Never average arrondissement medians** — recompute from `ventes`.

## ETL output tables

| Table                                                         | Contents                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `mutations`                                                   | one row per mutation, all transaction types                                     |
| `ventes`                                                      | mutations where `nature_mutation='Vente'`, `n_principaux=1`, price and area > 0 |
| `agg_recent`                                                  | 24-month medians per commune × type, deciles D1/Q1/Q3/D9                        |
| `agg_annuel`                                                  | 5-year series per commune × year × type                                         |
| `agg_pieces`                                                  | per commune × type × room count (1-5+), 24 months, price and area quartiles     |
| `agg_pieces_annuel`                                          | 5-year series per commune × year × type × room count                            |
| `agg_recent_villes`, `agg_annuel_villes`, `agg_pieces_villes`, `agg_pieces_annuel_villes` | same, for aggregated Paris/Lyon/Marseille           |
| `agg_coords`, `agg_coords_villes`, `agg_coords_departements` | median location of an area's own sales, one point per mutation, 4 decimals (~11 m). Feeds `geo` in the `Place` of the Dataset markup. Two communes have none — DVF geolocates neither |
| `agg_recent_departements`, `agg_annuel_departements`          | per département × type, recomputed from `ventes` — never a median of commune medians. Carries `n_communes`, the communes where that type sold, which is wider than the list of published communes |
| `agg_recent_france`, `agg_annuel_france`                      | the same two, for the whole country — what makes "18 % under the national median" statable |

The `*_departements` and `*_france` tables feed `data/departements-agg.json`
(`{ national, departments }`, each department carrying `recent`, `yearly`, `geo`),
kept out of `communes.json` because the build reads that file whole for every
page. No publication threshold applies to them: the thinnest département still
records ~200 sales over the 24-month window.

## `communes.json` format

**Keys in English** (it is code); values stay in French.

```json
[
  {
    "code": "33063",
    "name": "Bordeaux",
    "slug": "bordeaux",
    "geo": { "lat": 44.842, "lon": -0.5737 },
    "department": { "code": "33", "name": "Gironde", "slug": "gironde" },
    "recent": {
      "apartment": {
        "count": 6324,
        "pricePerSqm": 4167,
        "medianPrice": 204000,
        "medianArea": 51,
        "d1": 0,
        "q1": 0,
        "q3": 0,
        "d9": 0
      },
      "house": {}
    },
    "yearly": [
      {
        "year": 2021,
        "apartment": { "count": 0, "pricePerSqm": 0, "medianPrice": 0 },
        "house": {}
      }
    ],
    "rooms": {
      "apartment": [
        {
          "rooms": 1,
          "count": 0,
          "medianPrice": 0,
          "priceQ1": 0,
          "priceQ3": 0,
          "pricePerSqm": 0,
          "medianArea": 0,
          "areaQ1": 0,
          "areaQ3": 0,
          "yearly": [{ "year": 2021, "count": 0, "medianPrice": 0, "pricePerSqm": 0 }]
        }
      ],
      "house": []
    }
  }
]
```

## Metrics to display (commune page)

**Above the fold**: median €/m² per property type plus sale count; median total
price ("an apartment sold for €204,000" lands better than a €/m² figure);
1-year and 5-year change; yearly transaction volume.

**Secondary**: median price by room count (T1→T5+); median floor area;
house/apartment split.

**Percentiles: translate them, never show them raw.** "Half of apartments sold
between €3,100 and €5,400/m²", or "10 % sold below €X/m²". Add a caveat: DVF
says nothing about property condition, and a low price usually has a reason.

## Market context (useful for editorial pages)

- National volumes **up in 2025** across every quarter (+13 % in Q1, +9 % in Q3
  vs 2024) — the market has recovered
- Bordeaux: houses (€4,894/m²) cost more than apartments (€4,167/m²) — the
  city-centre _échoppe_ effect; counter-intuitive but real
- 8× spread between the priciest and cheapest Marseille arrondissements

## Positioning and known limits

The "prix m2 [city]" niche is saturated (SeLoger, MeilleursAgents, PAP, Figaro)
**and** captured at position 1 by Google's AI Overview. Do not chase the head.

Genuinely open angles:

1. **Computed queries** the AI Overview cannot answer: "communes where prices
   fell the most in Gironde", neighbouring-commune comparisons, long-run trends
2. **LLM citation** — exposing methodology, sample size and source makes a
   figure citable, where competitors publish unsourced proprietary estimates.
   Requires HTML readable without JS, and figures in text (not only in a canvas)
3. **MCP server** over the aggregates — few French sources offer one. A handful
   of tools (`get_commune_stats`, `compare_communes`, `get_evolution`) on top of
   the JSON. Planned post-MVP.

## Out of MVP scope

- Map (H3 + deck.gl considered, deferred)
- Neighbourhood / IRIS pages (needs an IGN spatial join; neighbourhood long tail
  only exists in large cities)
- City × year pages — only build if an Ahrefs check confirms the volume, and
  only with year-specific content (quarterly breakdown, YoY change), otherwise
  it is duplicate content
- INSEE population / COG (the INSEE `communes.csv` was explicitly ruled out:
  DVF already provides code, name and département)
- Monetisation
