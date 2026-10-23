// Herkent actiepunten in korte aantekeningen, zonder AI en zonder kosten.
// Een regel telt als actiepunt als hij begint met "Actie:", "Actiepunt:", "AP:", "Todo:" of een pijl (-> of →).
// Wie: de eerste naam van een teamlid die in de regel staat. Wanneer: een datum (25-10, 25/10/2026),
// vandaag, morgen, overmorgen, volgende week of een dag van de week (de eerstvolgende na het overleg).

export type Proposal = { text: string; ownerId: string | null; dueDate: string | null }

const START = /^\s*(?:[-*•]\s*)?(?:(?:actie(?:punt)?|ap|todo|to do)\s*[:.]|->|→)\s*(.+)$/i
const DAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function findDate(line: string, meetingDate: string): string | null {
  const l = line.toLowerCase()
  const m = l.match(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?\b/)
  if (m) {
    const day = Number(m[1])
    const month = Number(m[2])
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      let year = m[3] ? Number(m[3]) : Number(meetingDate.slice(0, 4))
      if (year < 100) year += 2000
      let date = `${year}-${pad(month)}-${pad(day)}`
      // Zonder jaartal en al voorbij: dan is volgend jaar bedoeld.
      if (!m[3] && date < meetingDate) date = `${year + 1}-${pad(month)}-${pad(day)}`
      return date
    }
  }
  if (/\bovermorgen\b/.test(l)) return addDays(meetingDate, 2)
  if (/\bmorgen\b/.test(l)) return addDays(meetingDate, 1)
  if (/\bvandaag\b/.test(l)) return meetingDate
  if (/\bvolgende week\b/.test(l)) return addDays(meetingDate, 7)
  const base = new Date(meetingDate + 'T12:00:00Z').getUTCDay() || 7
  for (let i = 0; i < DAYS.length; i++) {
    if (new RegExp(`\\b${DAYS[i]}\\b`).test(l)) {
      const diff = (i + 1 - base + 7) % 7 || 7
      return addDays(meetingDate, diff)
    }
  }
  return null
}

export function findOwner(line: string, team: { id: string; name: string }[]): string | null {
  const l = line.toLowerCase()
  let best: { id: string; at: number } | null = null
  for (const u of team) {
    const first = u.name.split(' ')[0].toLowerCase()
    if (first.length < 2) continue
    const at = l.search(new RegExp(`(^|[^a-zà-ÿ])@?${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-zà-ÿ])`))
    if (at >= 0 && (!best || at < best.at)) best = { id: u.id, at }
  }
  return best?.id ?? null
}

// De tekst van een actieregel, of null als de regel geen actiepunt is.
export function actionText(line: string): string | null {
  const m = line.match(START)
  return m ? m[1].trim().slice(0, 1000) || null : null
}

export function recognise(notes: string, meetingDate: string, team: { id: string; name: string }[]): Proposal[] {
  const out: Proposal[] = []
  // Een formulier stuurt regels mee als \r\n, dus splitsen op beide.
  for (const raw of notes.split(/\r?\n/)) {
    const text = actionText(raw)
    if (!text) continue
    out.push({ text, ownerId: findOwner(text, team), dueDate: findDate(text, meetingDate) })
  }
  return out
}
