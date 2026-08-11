// French output formatting. Intl uses a narrow no-break space (U+202F) as the
// thousands separator, which keeps amounts from wrapping without any manual
// handling.

const euro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

const percent = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 1,
})

const signedPercent = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

export const formatEuro = (value) => euro.format(value)

export const formatPricePerSqm = (value) => `${euro.format(value)}/m²`

/** Prose variant: « 4 167 € le m² » reads better mid-sentence than « €/m² ». */
export const formatPricePerSqmProse = (value) => `${euro.format(value)} le m²`

export const formatArea = (value) => `${integer.format(value)} m²`

export const formatCount = (value) => integer.format(value)

/** `ratio` is a relative change: 0.037 -> « +3,7 % ». Signed, for standalone deltas. */
export const formatPercent = (ratio) => signedPercent.format(ratio)

/**
 * Magnitude only: 0.037 and -0.037 both give « 3,7 % ». For prose where a verb
 * already carries the direction — « a reculé de 2,5 % », not « de -2,5 % ».
 */
export const formatPercentMagnitude = (ratio) => percent.format(Math.abs(ratio))

export const plural = (count, singular, pluralForm = `${singular}s`) =>
  count > 1 ? pluralForm : singular

/**
 * Type labels, used in prose and headings. `feminine` drives past-participle
 * agreement in generated sentences — « une maison s'est vendue » against
 * « un appartement s'est vendu » — since the same sentence serves both types.
 */
export const TYPE_LABELS = {
  apartment: {
    singular: 'appartement',
    plural: 'appartements',
    title: 'Appartements',
    article: 'un',
    // Elision means the definite form cannot be assembled from an article and
    // a noun by concatenation — « l'appartement », not « le appartement ».
    definite: "l'appartement",
    feminine: false,
  },
  house: {
    singular: 'maison',
    plural: 'maisons',
    title: 'Maisons',
    article: 'une',
    definite: 'la maison',
    feminine: true,
  },
}

/**
 * Partitive « de » with elision: « de maisons », « d'appartements ». The rule
 * belongs to the noun, not to the property type, so it takes the word rather
 * than the type key.
 */
export const partitive = (noun) =>
  /^[aeiouyâàéèêëîïôöùûüh]/i.test(noun) ? `d'${noun}` : `de ${noun}`

/** Agreement suffix for a past participle: « vendu » -> « vendue ». */
export const agree = (type) => (TYPE_LABELS[type].feminine ? 'e' : '')

/**
 * Locative preposition: « à Bordeaux », « au Havre », « aux Sables-d'Olonne ».
 * The article is part of the DVF name, so it has to be contracted.
 */
export const locative = (name) => {
  if (name.startsWith('Les ')) return `aux ${name.slice(4)}`
  if (name.startsWith('Le ')) return `au ${name.slice(3)}`
  return `à ${name}`
}

/** T1…T5+ for apartments, « 5 pièces et + » otherwise. */
export const roomLabel = (rooms, type) => {
  const capped = rooms >= 5
  if (type === 'apartment') return capped ? 'T5 et +' : `T${rooms}`
  return capped ? '5 pièces et +' : `${rooms} ${plural(rooms, 'pièce')}`
}
