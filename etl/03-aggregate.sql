CREATE OR REPLACE TABLE agg_recent AS
SELECT
  code_commune,
  any_value(nom_commune)      AS nom_commune,
  any_value(code_departement) AS code_departement,
  type_local,
  count(*)                                AS n,
  round(median(prix_m2))                  AS prix_m2_median,
  round(quantile_cont(prix_m2, 0.10))     AS prix_m2_d1,
  round(quantile_cont(prix_m2, 0.25))     AS prix_m2_q1,
  round(quantile_cont(prix_m2, 0.75))     AS prix_m2_q3,
  round(quantile_cont(prix_m2, 0.90))     AS prix_m2_d9,
  round(median(prix))                     AS prix_median,
  round(median(surface))                  AS surface_mediane
FROM ventes
WHERE annee >= 2024
GROUP BY code_commune, type_local
HAVING count(*) >= 20;

CREATE OR REPLACE TABLE agg_annuel AS
SELECT code_commune, annee, type_local,
       count(*)               AS n,
       round(median(prix_m2)) AS prix_m2_median,
       round(median(prix))    AS prix_median
FROM ventes
GROUP BY 1,2,3
HAVING count(*) >= 10;

-- Quartiles on the price and on the surface, not only on the price per sqm as
-- agg_recent does. A typology page states two spreads a commune page cannot:
-- what half the T3 actually sold for, and what a T3 measures locally — 61 m² in
-- Montreuil, half of them between 53 and 67. Deciles are left out: at cell
-- level the sample is an order of magnitude thinner than the commune total, and
-- D1/D9 there would describe the tail of a few dozen sales.
CREATE OR REPLACE TABLE agg_pieces AS
SELECT code_commune, type_local,
       least(pieces, 5)                    AS pieces,
       count(*)                            AS n,
       round(median(prix))                 AS prix_median,
       round(quantile_cont(prix, 0.25))    AS prix_q1,
       round(quantile_cont(prix, 0.75))    AS prix_q3,
       round(median(prix_m2))              AS prix_m2_median,
       round(median(surface))              AS surface_mediane,
       round(quantile_cont(surface, 0.25)) AS surface_q1,
       round(quantile_cont(surface, 0.75)) AS surface_q3
FROM ventes
WHERE annee >= 2024 AND pieces BETWEEN 1 AND 20
GROUP BY 1,2,3
HAVING count(*) >= 10;

-- Five-year series, one typology at a time — agg_annuel only splits by property
-- type, which cannot say whether a commune's fall was carried by its small flats
-- or its large ones. Same 10-sale floor as agg_annuel: enough to plot a point,
-- not enough to subtract two, and the site raises the bar where it does so.
CREATE OR REPLACE TABLE agg_pieces_annuel AS
SELECT code_commune, annee, type_local,
       least(pieces, 5)       AS pieces,
       count(*)               AS n,
       round(median(prix))    AS prix_median,
       round(median(prix_m2)) AS prix_m2_median
FROM ventes
WHERE pieces BETWEEN 1 AND 20
GROUP BY 1,2,3,4
HAVING count(*) >= 10;

-- Where a commune is, taken from the sales themselves: DVF geolocates every
-- line, so the median of a commune's own sale coordinates lands inside its
-- built-up area — closer to what a reader means by "the commune" than a
-- geometric centroid, which in a large rural commune sits in a field.
--
-- Two rules hold it in place. One point per mutation, per the deduplication
-- rule, so a sale split across four parcels does not pull the median four
-- times. And four decimals, about 11 metres: an aggregate over dozens of sales
-- carries no address, and publishing more precision than the figure deserves
-- would only invite the reader to read a location into it.
CREATE OR REPLACE TABLE agg_coords AS
WITH points AS (
  SELECT id_mutation,
         any_value(code_commune) AS code_commune,
         median(latitude)        AS latitude,
         median(longitude)       AS longitude
  FROM dvf
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  GROUP BY id_mutation
)
SELECT code_commune,
       count(*)                   AS n,
       round(median(latitude), 4) AS latitude,
       round(median(longitude), 4) AS longitude
FROM points
GROUP BY 1;

CREATE OR REPLACE TABLE agg_coords_villes AS
WITH points AS (
  SELECT id_mutation,
         CASE WHEN any_value(code_commune) LIKE '751%'  THEN '75056'
              WHEN any_value(code_commune) LIKE '6938%' THEN '69123'
              WHEN any_value(code_commune) LIKE '132%'  THEN '13055' END AS code_commune,
         median(latitude)  AS latitude,
         median(longitude) AS longitude
  FROM dvf
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    AND (code_commune LIKE '751%' OR code_commune LIKE '6938%' OR code_commune LIKE '132%')
  GROUP BY id_mutation
)
SELECT code_commune,
       count(*)                   AS n,
       round(median(latitude), 4) AS latitude,
       round(median(longitude), 4) AS longitude
FROM points
GROUP BY 1;

CREATE OR REPLACE TABLE agg_coords_departements AS
WITH points AS (
  SELECT id_mutation,
         any_value(code_departement) AS code_departement,
         median(latitude)            AS latitude,
         median(longitude)           AS longitude
  FROM dvf
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  GROUP BY id_mutation
)
SELECT code_departement,
       count(*)                   AS n,
       round(median(latitude), 4) AS latitude,
       round(median(longitude), 4) AS longitude
FROM points
GROUP BY 1;

-- Department and national medians, recomputed from `ventes` for the same reason
-- the *_villes tables are: a median of the medians below would be a different,
-- wrong number. They are also wider than the pages they sit above — every sale
-- counts, including those of the communes too small to be published — so the
-- page that carries them says which base each figure rests on. No sale floor:
-- the thinnest department still records several thousand over 24 months.
CREATE OR REPLACE TABLE agg_recent_departements AS
SELECT
  code_departement,
  type_local,
  count(*)                            AS n,
  count(DISTINCT code_commune)        AS n_communes,
  round(median(prix_m2))              AS prix_m2_median,
  round(quantile_cont(prix_m2, 0.10)) AS prix_m2_d1,
  round(quantile_cont(prix_m2, 0.25)) AS prix_m2_q1,
  round(quantile_cont(prix_m2, 0.75)) AS prix_m2_q3,
  round(quantile_cont(prix_m2, 0.90)) AS prix_m2_d9,
  round(median(prix))                 AS prix_median,
  round(median(surface))              AS surface_mediane
FROM ventes
WHERE annee >= 2024
GROUP BY 1,2;

CREATE OR REPLACE TABLE agg_annuel_departements AS
SELECT code_departement, annee, type_local,
       count(*)               AS n,
       round(median(prix_m2)) AS prix_m2_median,
       round(median(prix))    AS prix_median
FROM ventes
GROUP BY 1,2,3;

-- Two rows over 24 months, ten over five years. They are what turns a local
-- median into a statement — "18 % under the national figure", "the department
-- fell while France rose" — which is the one thing no other page can say.
CREATE OR REPLACE TABLE agg_recent_france AS
SELECT
  type_local,
  count(*)                            AS n,
  count(DISTINCT code_departement)    AS n_departements,
  count(DISTINCT code_commune)        AS n_communes,
  round(median(prix_m2))              AS prix_m2_median,
  round(quantile_cont(prix_m2, 0.10)) AS prix_m2_d1,
  round(quantile_cont(prix_m2, 0.25)) AS prix_m2_q1,
  round(quantile_cont(prix_m2, 0.75)) AS prix_m2_q3,
  round(quantile_cont(prix_m2, 0.90)) AS prix_m2_d9,
  round(median(prix))                 AS prix_median,
  round(median(surface))              AS surface_mediane
FROM ventes
WHERE annee >= 2024
GROUP BY 1;

CREATE OR REPLACE TABLE agg_annuel_france AS
SELECT annee, type_local,
       count(*)               AS n,
       round(median(prix_m2)) AS prix_m2_median,
       round(median(prix))    AS prix_median
FROM ventes
GROUP BY 1,2;

CREATE OR REPLACE TABLE agg_recent_villes AS
SELECT
  CASE WHEN code_commune LIKE '751%' THEN '75056'
       WHEN code_commune LIKE '6938%' THEN '69123'
       WHEN code_commune LIKE '132%'  THEN '13055' END AS code_commune,
  CASE WHEN code_commune LIKE '751%' THEN 'Paris'
       WHEN code_commune LIKE '6938%' THEN 'Lyon'
       WHEN code_commune LIKE '132%'  THEN 'Marseille' END AS nom_commune,
  left(code_commune, 2) AS code_departement,
  type_local,
  count(*)                            AS n,
  round(median(prix_m2))              AS prix_m2_median,
  round(quantile_cont(prix_m2, 0.10)) AS prix_m2_d1,
  round(quantile_cont(prix_m2, 0.25)) AS prix_m2_q1,
  round(quantile_cont(prix_m2, 0.75)) AS prix_m2_q3,
  round(quantile_cont(prix_m2, 0.90)) AS prix_m2_d9,
  round(median(prix))                 AS prix_median,
  round(median(surface))              AS surface_mediane
FROM ventes
WHERE annee >= 2024
  AND (code_commune LIKE '751%' OR code_commune LIKE '6938%' OR code_commune LIKE '132%')
GROUP BY 1,2,3,4;

CREATE OR REPLACE TABLE agg_annuel_villes AS
SELECT
  CASE WHEN code_commune LIKE '751%' THEN '75056'
       WHEN code_commune LIKE '6938%' THEN '69123'
       WHEN code_commune LIKE '132%'  THEN '13055' END AS code_commune,
  annee, type_local,
  count(*)               AS n,
  round(median(prix_m2)) AS prix_m2_median,
  round(median(prix))    AS prix_median
FROM ventes
WHERE code_commune LIKE '751%' OR code_commune LIKE '6938%' OR code_commune LIKE '132%'
GROUP BY 1,2,3;

CREATE OR REPLACE TABLE agg_pieces_villes AS
SELECT
  CASE WHEN code_commune LIKE '751%' THEN '75056'
       WHEN code_commune LIKE '6938%' THEN '69123'
       WHEN code_commune LIKE '132%'  THEN '13055' END AS code_commune,
  type_local, least(pieces, 5) AS pieces,
  count(*)                            AS n,
  round(median(prix))                 AS prix_median,
  round(quantile_cont(prix, 0.25))    AS prix_q1,
  round(quantile_cont(prix, 0.75))    AS prix_q3,
  round(median(prix_m2))              AS prix_m2_median,
  round(median(surface))              AS surface_mediane,
  round(quantile_cont(surface, 0.25)) AS surface_q1,
  round(quantile_cont(surface, 0.75)) AS surface_q3
FROM ventes
WHERE annee >= 2024 AND pieces BETWEEN 1 AND 20
  AND (code_commune LIKE '751%' OR code_commune LIKE '6938%' OR code_commune LIKE '132%')
GROUP BY 1,2,3;

CREATE OR REPLACE TABLE agg_pieces_annuel_villes AS
SELECT
  CASE WHEN code_commune LIKE '751%' THEN '75056'
       WHEN code_commune LIKE '6938%' THEN '69123'
       WHEN code_commune LIKE '132%'  THEN '13055' END AS code_commune,
  annee, type_local, least(pieces, 5) AS pieces,
  count(*)               AS n,
  round(median(prix))    AS prix_median,
  round(median(prix_m2)) AS prix_m2_median
FROM ventes
WHERE pieces BETWEEN 1 AND 20
  AND (code_commune LIKE '751%' OR code_commune LIKE '6938%' OR code_commune LIKE '132%')
GROUP BY 1,2,3,4;