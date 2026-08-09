CREATE OR REPLACE TABLE dvf AS
SELECT * FROM read_csv('dvf.csv.gz',
  quote='"',
  types={
    'lot1_numero':'VARCHAR','lot2_numero':'VARCHAR','lot3_numero':'VARCHAR',
    'lot4_numero':'VARCHAR','lot5_numero':'VARCHAR',
    'adresse_numero':'VARCHAR','adresse_suffixe':'VARCHAR',
    'code_postal':'VARCHAR','code_commune':'VARCHAR','code_departement':'VARCHAR',
    'ancien_code_commune':'VARCHAR','adresse_code_voie':'VARCHAR',
    'numero_volume':'VARCHAR'
  });