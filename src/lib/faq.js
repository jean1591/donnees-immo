// Questions a commune page can actually answer, built from its own figures.
//
// The rule is that nothing here is a template with holes: every answer states a
// number the page already publishes, and a question whose data is missing is not
// asked at all. That is also what keeps the block from being duplicate content —
// two thirds of communes publish a single property type, four communes in ten
// hold no usable one-year trend, and typology cells exist in fifty markets, so
// the set of questions differs from one page to the next along with the answers.
//
// The strings are shared by the visible block and the FAQPage markup: the two
// cannot drift, and Google's guidelines are satisfied by construction — the
// markup describes text that is genuinely on screen.

import { evolution, publishedTypes } from './communes.js'
import { departmentBySlug, gapToNational, national } from './departments.js'
import { RECENT_WINDOW } from './dataset.js'
import { hasRoomPage, roomCell } from './rooms.js'
import {
  formatArea,
  formatCount,
  formatEuro,
  formatPercentMagnitude,
  formatPricePerSqm,
  locative,
  TYPE_LABELS,
} from './format.js'

/** Below this, a one-year move is noise dressed as a trend. */
const STABLE = 0.005

/** Sales a room-count cell needs before its median is worth a sentence. */
const MIN_ROOM_SALES = 50

const priceQuestion = (commune, types, where) => {
  const parts = types.map(
    (type) =>
      `${formatPricePerSqm(commune.recent[type].pricePerSqm)} pour ${TYPE_LABELS[type].article} ${TYPE_LABELS[type].singular}`
  )
  const sales = types.reduce((sum, type) => sum + commune.recent[type].count, 0)
  return {
    question: `Quel est le prix au m² ${where} ?`,
    answer:
      `Le prix médian s'établit à ${parts.join(' et ')}, calculé sur ` +
      `${formatCount(sales)} ventes enregistrées ${RECENT_WINDOW.between}.`,
  }
}

const purchaseQuestion = (commune, type, where) => {
  const block = commune.recent[type]
  const label = TYPE_LABELS[type]
  return {
    question: `Combien coûte ${label.article} ${label.singular} ${where} ?`,
    answer:
      `${label.article === 'un' ? 'Un' : 'Une'} ${label.singular} s'y vend ` +
      `${formatEuro(block.medianPrice)} au prix médian, pour ${formatArea(block.medianArea)} ` +
      `de surface. La moitié des ventes se sont conclues au-dessus de ce prix, l'autre moitié ` +
      `en dessous.`,
  }
}

const trendQuestion = (commune, type, where) => {
  const trend = evolution(commune, type, 1)
  if (!trend) return null
  const label = TYPE_LABELS[type]
  const move =
    Math.abs(trend.ratio) < STABLE
      ? `est resté stable entre ${trend.from} et ${trend.to}`
      : `${trend.ratio > 0 ? 'a augmenté' : 'a reculé'} de ` +
        `${formatPercentMagnitude(trend.ratio)} entre ${trend.from} et ${trend.to}`
  return {
    question: `Les prix de l'immobilier ont-ils baissé ${where} ?`,
    answer:
      `Le prix médian au m² des ${label.plural} ${move}. Cette variation porte sur les ventes ` +
      `de chacune des deux années, et non sur une estimation.`,
  }
}

const comparisonQuestion = (commune, type, where) => {
  const department = departmentBySlug.get(commune.department.slug)
  const departmentBlock = department?.recent[type]
  if (!departmentBlock?.pricePerSqm) return null

  const label = TYPE_LABELS[type]
  const local = commune.recent[type].pricePerSqm
  const gapDepartment = local / departmentBlock.pricePerSqm - 1
  // Paris is its own department, so the two medians are the same figure and the
  // question answers itself. The same guard covers the communes that happen to
  // land on their department's median, where « 0 % moins cher » is noise.
  if (Math.abs(gapDepartment) < 0.01) return null
  const gapCountry = gapToNational(commune.recent[type], type)

  const side = (gap) => (gap > 0 ? 'plus cher' : 'moins cher')
  const country =
    gapCountry === null
      ? ''
      : ` et ${formatPercentMagnitude(gapCountry)} ${side(gapCountry)} que la médiane ` +
        `nationale (${formatPricePerSqm(national.recent[type].pricePerSqm)})`

  return {
    // « le département X » rather than « en Gironde » / « dans le Rhône » /
    // « aux Hauts-de-Seine »: the dataset carries no gender or article, and the
    // rest of the site settled on the same detour.
    question: `Le prix au m² est-il plus élevé ${where} que dans le département ${commune.department.name} ?`,
    answer:
      `Le m² des ${label.plural} y est ${formatPercentMagnitude(gapDepartment)} ` +
      `${side(gapDepartment)} que la médiane du département ` +
      `(${formatPricePerSqm(departmentBlock.pricePerSqm)})${country}.`,
  }
}

const roomQuestion = (commune, where) => {
  const cell = commune.rooms.apartment.find(
    (entry) => entry.rooms === 3 && entry.count >= MIN_ROOM_SALES
  )
  if (!cell) return null
  return {
    question: `Combien coûte un T3 ${where} ?`,
    answer:
      `Un appartement de trois pièces s'y vend ${formatEuro(cell.medianPrice)} au prix médian, ` +
      `pour ${formatArea(cell.medianArea)}. La moitié des ventes se situent entre ` +
      `${formatEuro(cell.priceQ1)} et ${formatEuro(cell.priceQ3)}.`,
  }
}

// The one answer that carried no figure of its own, and therefore ran word for
// word across every page that asked it. It now states what the commune's own
// sample is made of — which is also the honest answer to the question.
const trustQuestion = (commune, types, where) => {
  const sales = types.reduce((sum, type) => sum + commune.recent[type].count, 0)
  const detail = types
    .map((type) => `${formatCount(commune.recent[type].count)} ${TYPE_LABELS[type].plural}`)
    .join(' et ')
  return {
    question: `Ces prix sont-ils fiables ?`,
    answer:
      `Ils viennent des ventes réellement enregistrées par l'administration fiscale (DVF), ` +
      `et non d'estimations. Le chiffre publié ${where} repose sur ${detail}, ` +
      `soit ${formatCount(sales)} ventes, et c'est une médiane : elle résiste aux prix atypiques ` +
      `qu'une moyenne absorberait. Les DVF ignorent en revanche l'état du bien, l'étage et le ` +
      `quartier — une médiane situe un marché, elle n'estime pas un logement.`,
  }
}

/**
 * Four data questions at most, plus the one on method, which closes every list:
 * it is the answer that makes the rest citable, and the only one that never
 * depends on what the commune publishes.
 */
export const buildFaq = (commune) => {
  const types = publishedTypes(commune)
  if (!types.length) return []

  const lead = types[0]
  const where = locative(commune.name)

  const candidates = [
    priceQuestion(commune, types, where),
    purchaseQuestion(commune, lead, where),
    trendQuestion(commune, lead, where),
    comparisonQuestion(commune, lead, where),
    roomQuestion(commune, where),
  ].filter(Boolean)

  return [...candidates.slice(0, 4), trustQuestion(commune, types, where)]
}

/**
 * Department pages ask different questions from commune pages, because the page
 * answers different ones: what the whole department is worth, which commune
 * tops it, where it sits nationally. `extremes` and `rank` come from the page,
 * which already computes them for its own blocks — recomputing here would risk
 * the two disagreeing.
 */
export const buildDepartmentFaq = (department, { extremes, rank } = {}) => {
  const types = publishedTypes(department)
  if (!types.length) return []

  const lead = types[0]
  const label = TYPE_LABELS[lead]
  const block = department.recent[lead]
  const name = `le département ${department.name}`

  const items = []

  items.push({
    question: `Quel est le prix au m² dans ${name} ?`,
    answer:
      `Le prix médian s'établit à ${types
        .map(
          (type) =>
            `${formatPricePerSqm(department.recent[type].pricePerSqm)} pour ${TYPE_LABELS[type].article} ${TYPE_LABELS[type].singular}`
        )
        .join(' et ')}, calculé sur l'ensemble des ventes du département ` +
      `${RECENT_WINDOW.between}, y compris celles des communes trop petites pour avoir leur ` +
      `propre page.`,
  })

  if (extremes?.highest?.length) {
    const dearest = extremes.highest[0]
    const cheapest = extremes.lowest[0]
    const extremeLabel = TYPE_LABELS[extremes.type]
    items.push({
      question: `Quelle est la commune la plus chère ${
        department.name.startsWith('Les ') ? 'des' : 'du département'
      } ${department.name} ?`,
      answer:
        `${dearest.name}, à ${formatPricePerSqm(dearest.recent[extremes.type].pricePerSqm)} ` +
        `pour ${extremeLabel.article} ${extremeLabel.singular}. À l'autre bout, ` +
        `${cheapest.name} est la plus abordable, à ` +
        `${formatPricePerSqm(cheapest.recent[extremes.type].pricePerSqm)}.`,
    })
  }

  const trend = trendQuestion(department, lead, `dans ${name}`)
  if (trend) items.push(trend)

  const gap = gapToNational(block, lead)
  if (gap !== null && Math.abs(gap) >= 0.01) {
    items.push({
      // « le département X » again: « Gironde est-il » would be wrong and
      // « est-elle » would be wrong for the Rhône, and the dataset says which
      // for neither.
      question: `Le département ${department.name} est-il plus cher que la moyenne nationale ?`,
      answer:
        `Le m² des ${label.plural} y est ${formatPercentMagnitude(gap)} ` +
        `${gap > 0 ? 'plus cher' : 'moins cher'} que la médiane nationale ` +
        `(${formatPricePerSqm(national.recent[lead].pricePerSqm)})` +
        `${rank ? `, ce qui place le département au ${rank.rank}${rank.rank === 1 ? 'er' : 'e'} rang sur ${rank.total}` : ''}.`,
    })
  }

  return [
    ...items.slice(0, 4),
    {
      question: `Ces prix sont-ils fiables ?`,
      answer:
        `Ils viennent des ventes réellement enregistrées par l'administration fiscale (DVF), et ` +
        `non d'estimations. La médiane ${name} est recalculée sur les ` +
        `${formatCount(types.reduce((sum, type) => sum + department.recent[type].count, 0))} ` +
        `ventes du territoire ${RECENT_WINDOW.between}, et non moyennée à partir des médianes ` +
        `communales, ce qui donnerait un chiffre différent et faux.`,
    },
  ]
}

/**
 * A typology page answers the narrowest questions of the site: what a T3 costs
 * here, what budget it takes, how big one is. The figures are passed in — the
 * page computes them for its own blocks, and a second computation could answer
 * a question with a number the blocks above contradict.
 *
 * No question on the premium over the commune's whole apartment market: with a
 * trend available on every one of these 149 pages, it never reached the four
 * data slots, and the page states it in prose anyway.
 */
export const buildTypologyFaq = ({ commune, prose, cell, trend }) => {
  const where = locative(commune.name)
  const items = [
    {
      question: `Combien coûte un ${prose} ${where} ?`,
      answer:
        `Un ${prose} s'y vend ${formatEuro(cell.medianPrice)} au prix médian, pour ` +
        `${formatArea(cell.medianArea)}, soit ${formatPricePerSqm(cell.pricePerSqm)}. ` +
        `Médiane sur ${formatCount(cell.count)} ventes ${RECENT_WINDOW.between}.`,
    },
    {
      question: `Quel budget faut-il pour un ${prose} ${where} ?`,
      answer:
        `La moitié des ${prose} se sont vendus entre ${formatEuro(cell.priceQ1)} et ` +
        `${formatEuro(cell.priceQ3)}. Un quart sont partis sous ${formatEuro(cell.priceQ1)}, ` +
        `un quart au-dessus de ${formatEuro(cell.priceQ3)}.`,
    },
    {
      question: `Quelle surface fait un ${prose} ${where} ?`,
      answer:
        `${formatArea(cell.medianArea)} en médiane, la moitié des ventes se situant entre ` +
        `${formatArea(cell.areaQ1)} et ${formatArea(cell.areaQ3)}.`,
    },
  ]

  if (trend) {
    const move =
      Math.abs(trend.ratio) < STABLE
        ? `est resté stable entre ${trend.from} et ${trend.to}`
        : `${trend.ratio > 0 ? 'a augmenté' : 'a reculé'} de ` +
          `${formatPercentMagnitude(trend.ratio)} entre ${trend.from} et ${trend.to}`
    items.push({
      question: `Les prix des ${prose} ont-ils baissé ${where} ?`,
      answer:
        `Le prix médian au m² des ${prose} ${move}. Cette variation porte sur cette seule ` +
        `typologie, pas sur l'ensemble du marché.`,
    })
  }

  return [
    ...items.slice(0, 4),
    {
      question: `Ces prix sont-ils fiables ?`,
      answer:
        `Ils viennent des ventes réellement enregistrées par l'administration fiscale (DVF), et ` +
        `non d'estimations. Celui-ci repose sur les ${formatCount(cell.count)} ${prose} vendus ` +
        `${where} ${RECENT_WINDOW.between}. Une page de typologie n'existe qu'au-dessus de 100 ` +
        `ventes : en deçà, la médiane d'une seule typologie bouge trop d'une année sur l'autre ` +
        `pour être publiée.`,
    },
  ]
}

/**
 * Questions a city-versus-city page can answer, and only it.
 *
 * None of these has a home on either commune page: each one needs both sets of
 * figures at once. Same rule as the commune block — a question whose data is
 * missing is not asked, so the set differs from one pair to the next.
 */
export const buildPairFaq = ({ a, b, data, budget }) => {
  const lead = data.lead
  const label = TYPE_LABELS[lead]
  const gap = data.gaps[lead]
  const items = []

  items.push({
    question: `Est-il plus cher d'acheter ${locative(a.name)} ou ${locative(b.name)} ?`,
    answer:
      `${gap.dearer.name} est la plus chère des deux : ` +
      `${formatPricePerSqm(gap.dearer.recent[lead].pricePerSqm)} contre ` +
      `${formatPricePerSqm(gap.cheaper.recent[lead].pricePerSqm)} pour ${label.article} ` +
      `${label.singular}, soit ${formatPercentMagnitude(gap.ratio)} d'écart. Les deux médianes ` +
      `portent sur la même fenêtre de 24 mois et sur ${formatCount(
        a.recent[lead].count + b.recent[lead].count
      )} ventes au total.`,
  })

  items.push({
    question: `Combien coûte ${label.article} ${label.singular} ${locative(a.name)} et ${locative(
      b.name
    )} ?`,
    answer: [a, b]
      .map(
        (city) =>
          `${formatEuro(city.recent[lead].medianPrice)} ${locative(city.name)} pour ` +
          `${formatArea(city.recent[lead].medianArea)}`
      )
      .join(', et ') +
      `. Ce sont des prix de vente médians : la moitié des transactions se sont conclues ` +
      `au-dessus, l'autre moitié en dessous.`,
  })

  const [budgetA, budgetB] = [data.budget[a.code], data.budget[b.code]]
  if (budgetA && budgetB && budgetA.rooms !== budgetB.rooms) {
    const larger = budgetA.rooms > budgetB.rooms ? { city: a, ...budgetA } : { city: b, ...budgetB }
    const smaller = budgetA.rooms > budgetB.rooms ? { city: b, ...budgetB } : { city: a, ...budgetA }
    const step = larger.rooms - smaller.rooms
    // The next typology up is only quoted where it is published in its own
    // right: a cell under the 100-sale bar carries a median the rest of the site
    // refuses to print, and this sentence would be the one place it slipped out.
    const nextUp = hasRoomPage(smaller.city, smaller.rooms + 1)
      ? roomCell(smaller.city, smaller.rooms + 1)
      : null
    items.push({
      question: `Qu'achète-t-on avec ${formatEuro(budget)} dans chacune des deux villes ?`,
      answer:
        `Un T${larger.rooms} ${locative(larger.city.name)}, dont le prix médian est de ` +
        `${formatEuro(larger.cell.medianPrice)}, mais seulement un T${smaller.rooms} ` +
        `${locative(smaller.city.name)}` +
        (nextUp
          ? `, où le T${smaller.rooms + 1} est déjà hors budget à ` +
            `${formatEuro(nextUp.medianPrice)}`
          : '') +
        `. ${step > 1 ? `Deux pièces d'écart` : `Une pièce d'écart`}, pour le même budget.`,
    })
  }

  if (data.spread?.disjoint) {
    const { dearer, cheaper } = data.spread
    items.push({
      question: `Les deux marchés se recoupent-ils ?`,
      answer:
        `Presque pas. Les 10 % de ${label.plural} les moins chers ${locative(dearer.name)} ` +
        `partent déjà à ${formatPricePerSqm(dearer.recent[lead].d1)}, au-dessus du prix médian ` +
        `${locative(cheaper.name)}, qui est de ` +
        `${formatPricePerSqm(cheaper.recent[lead].pricePerSqm)}. Le bas du marché de l'une ` +
        `coûte plus cher que le milieu du marché de l'autre.`,
    })
  }

  if (data.trends) {
    const left = data.trends[a.code]
    const right = data.trends[b.code]
    const move = (trend) =>
      Math.abs(trend.ratio) < STABLE
        ? 'est resté stable'
        : `${trend.ratio > 0 ? 'a progressé' : 'a reculé'} de ${formatPercentMagnitude(trend.ratio)}`
    items.push({
      question: `Quelle ville a le plus progressé en cinq ans ?`,
      answer:
        `Entre ${left.from} et ${left.to}, le prix au m² ${move(left)} ${locative(a.name)} et ` +
        `${move(right)} ${locative(b.name)}` +
        (data.nationalTrend
          ? `, quand la France entière ${move(data.nationalTrend)}`
          : '') +
        `. Ces variations sont nominales, avant inflation.`,
    })
  }

  const [actA, actB] = [data.activity[a.code], data.activity[b.code]]
  if (actA && actB) {
    const busier = actA.sales >= actB.sales ? a : b
    const quieter = busier.code === a.code ? b : a
    items.push({
      question: `Où le marché est-il le plus actif ?`,
      answer:
        `${busier.name}, avec ${formatCount(
          busier.code === a.code ? actA.sales : actB.sales
        )} ventes enregistrées en ${actA.year}, contre ${formatCount(
          quieter.code === a.code ? actA.sales : actB.sales
        )} ${locative(quieter.name)}. Le volume compte autant que le prix : un marché mince ` +
        `laisse moins de choix et rend chaque médiane plus fragile.`,
    })
  }

  return items
}
