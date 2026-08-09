CREATE OR REPLACE TABLE mutations AS
SELECT
  id_mutation,
  any_value(date_mutation)                    AS date_mutation,
  year(any_value(date_mutation))              AS annee,
  any_value(code_commune)                     AS code_commune,
  any_value(nom_commune)                      AS nom_commune,
  any_value(code_departement)                 AS code_departement,
  any_value(nature_mutation)                  AS nature_mutation,
  any_value(valeur_fonciere)                  AS prix,
  any_value(type_local)  FILTER (WHERE type_local IN ('Maison','Appartement')) AS type_local,
  any_value(surface_reelle_bati) FILTER (WHERE type_local IN ('Maison','Appartement')) AS surface,
  any_value(nombre_pieces_principales) FILTER (WHERE type_local IN ('Maison','Appartement')) AS pieces,
  count(*) FILTER (WHERE type_local IN ('Maison','Appartement')) AS n_principaux,
  count(*) FILTER (WHERE type_local = 'Dépendance') AS n_dependances,
  sum(DISTINCT surface_terrain)               AS surface_terrain
FROM dvf
GROUP BY id_mutation;

CREATE OR REPLACE TABLE ventes AS
SELECT *, prix / surface AS prix_m2
FROM mutations
WHERE nature_mutation = 'Vente'
  AND n_principaux = 1
  AND surface > 0
  AND prix > 0;