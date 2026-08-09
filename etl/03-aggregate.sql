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

CREATE OR REPLACE TABLE agg_pieces AS
SELECT code_commune, type_local,
       least(pieces, 5)       AS pieces,
       count(*)               AS n,
       round(median(prix))    AS prix_median,
       round(median(surface)) AS surface_mediane
FROM ventes
WHERE annee >= 2024 AND pieces BETWEEN 1 AND 20
GROUP BY 1,2,3
HAVING count(*) >= 10;

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
  count(*)               AS n,
  round(median(prix))    AS prix_median,
  round(median(surface)) AS surface_mediane
FROM ventes
WHERE annee >= 2024 AND pieces BETWEEN 1 AND 20
  AND (code_commune LIKE '751%' OR code_commune LIKE '6938%' OR code_commune LIKE '132%')
GROUP BY 1,2,3;