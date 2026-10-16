// Hulpjes voor vragen die zowel op de server als in de browser gebruikt worden.

export const ANDERS = 'Anders'

export const ONDERDELEN: Record<string, string> = {
  A: 'Hoe gaat het met jou?',
  B: 'Hoe gaat het met je werk?',
  C: 'Waar wil je naartoe?',
}

export function optionsOf(q: { options: string | null }): string[] {
  try {
    const list = JSON.parse(q.options ?? '[]')
    return Array.isArray(list) ? list.map(String) : []
  } catch {
    return []
  }
}

// Volgorde in een gesprek: eerst A, dan B, dan C, daarna vragen zonder onderdeel.
export function bySection<T extends { section: string | null; position: number }>(qs: T[]): T[] {
  const rank = (x: string | null) => (x && 'ABC'.includes(x) ? 'ABC'.indexOf(x) : 3)
  return [...qs].sort((a, b) => rank(a.section) - rank(b.section) || a.position - b.position)
}

export const STATUSSEN: Record<string, string> = { nog_niet: 'Nog niet begonnen', bezig: 'Bezig', gelukt: 'Gelukt' }
export const EIGENAREN: Record<string, string> = { medewerker: 'Medewerker', leidinggevende: 'Leidinggevende', samen: 'Samen' }

// Vragen voor de voorbereiding van de leidinggevende.
export const VOORBEREIDING_LEIDING = [
  { key: 'goed', vraag: 'Wat gaat goed bij deze medewerker?' },
  { key: 'ontwikkeling', vraag: 'Welke ontwikkeling zie ik?' },
  { key: 'aandacht', vraag: 'Wat vraagt aandacht?' },
  { key: 'nagekomen', vraag: 'Welke afspraken zijn nagekomen?' },
  { key: 'steun', vraag: 'Hoe kan ik deze medewerker beter ondersteunen?' },
] as const
