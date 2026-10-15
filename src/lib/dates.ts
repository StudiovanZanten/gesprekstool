// Datumhulpjes. Alle tijden worden getoond in Nederlandse tijd.

export const TZ = 'Europe/Amsterdam'

export function isoWeek(d: Date): { year: number; week: number } {
  const local = new Date(d.toLocaleString('en-US', { timeZone: TZ }))
  const t = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: t.getUTCFullYear(), week }
}

// Maandag van een ISO week, als datumtekst JJJJ-MM-DD.
export function mondayOfWeek(year: number, week: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const day = jan4.getUTCDay() || 7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7)
  return monday.toISOString().slice(0, 10)
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function weeksInYear(year: number): number {
  return isoWeek(new Date(Date.UTC(year, 11, 28, 12))).week
}

// Zet een Nederlandse datum en tijd om naar een echt tijdstip.
export function amsterdamToDate(dateStr: string, timeStr: string): Date {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`)
  const offset = tzOffsetMinutes(guess)
  return new Date(guess.getTime() - offset * 60000)
}

function tzOffsetMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return Math.round((asUtc - d.getTime()) / 60000)
}

export function todayStr(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d.length === 10 ? d + 'T12:00:00Z' : d) : d
  return date.toLocaleDateString('nl-NL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
}

export function fmtDateLong(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d.length === 10 ? d + 'T12:00:00Z' : d) : d
  return date.toLocaleDateString('nl-NL', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' })
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString('nl-NL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

export function weekLabel(year: number, week: number): string {
  const mon = mondayOfWeek(year, week)
  const fri = addDays(mon, 4)
  const f = (s: string) =>
    new Date(s + 'T12:00:00Z').toLocaleDateString('nl-NL', { timeZone: TZ, day: 'numeric', month: 'long' })
  return `Week ${week} (${f(mon)} tot ${f(fri)})`
}

// Naam van een gespreksronde, bijvoorbeeld "Week 44 tot en met 46 (26 oktober tot 13 november)".
export function roundLabel(year: number, week: number, weekEnd?: number | null): string {
  if (!weekEnd || weekEnd <= week) return weekLabel(year, week)
  const f = (s: string) =>
    new Date(s + 'T12:00:00Z').toLocaleDateString('nl-NL', { timeZone: TZ, day: 'numeric', month: 'long' })
  return `Week ${week} tot en met ${weekEnd} (${f(mondayOfWeek(year, week))} tot ${f(addDays(mondayOfWeek(year, weekEnd), 4))})`
}
