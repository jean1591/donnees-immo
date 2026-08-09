// Region grouping for the homepage. 101 departments in one flat list is a wall;
// grouped by region it becomes scannable. Not in the dataset — DVF carries no
// region code — so the mapping lives here.

const REGION_DEPARTMENTS = {
  'Auvergne-Rhône-Alpes': ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
  'Bourgogne-Franche-Comté': ['21', '25', '39', '58', '70', '71', '89', '90'],
  Bretagne: ['22', '29', '35', '56'],
  'Centre-Val de Loire': ['18', '28', '36', '37', '41', '45'],
  Corse: ['2A', '2B'],
  'Grand Est': ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
  'Hauts-de-France': ['02', '59', '60', '62', '80'],
  'Île-de-France': ['75', '77', '78', '91', '92', '93', '94', '95'],
  Normandie: ['14', '27', '50', '61', '76'],
  'Nouvelle-Aquitaine': ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
  Occitanie: ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
  'Pays de la Loire': ['44', '49', '53', '72', '85'],
  "Provence-Alpes-Côte d'Azur": ['04', '05', '06', '13', '83', '84'],
  'Outre-mer': ['971', '972', '973', '974', '976'],
}

const REGION_OF = new Map(
  Object.entries(REGION_DEPARTMENTS).flatMap(([region, codes]) =>
    codes.map((code) => [code, region])
  )
)

/**
 * Regions holding at least one published department, in the order above.
 * Bas-Rhin, Haut-Rhin, Moselle and Mayotte are absent from DVF, so Grand Est
 * and Outre-mer come back short rather than empty.
 */
export const groupByRegion = (departments) => {
  const groups = new Map(Object.keys(REGION_DEPARTMENTS).map((region) => [region, []]))
  for (const department of departments) {
    const region = REGION_OF.get(department.code)
    if (region) groups.get(region).push(department)
  }
  return [...groups]
    .filter(([, list]) => list.length > 0)
    .map(([name, list]) => ({
      name,
      departments: list.sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    }))
}
