import { fmtDate } from '@/lib/dates'
import { actionText } from '@/lib/herkennen'
import type { Action, Topic } from '@/lib/meetings'

// Onderdelen die het overzicht en het overleg zelf delen.

export const PRIVACY_TEKST =
  'Dit punt kan over deelnemers gaan. Gebruik alleen een voornaam of een letter, en schrijf geen medische gegevens op.'

export function Privacy() {
  return <p className="melding let-op klein">{PRIVACY_TEKST}</p>
}

// Aantekeningen netjes tonen: elke regel een eigen punt. Actieregels die al als actiepunt zijn opgeslagen, staan eronder en niet dubbel.
export function Notulen({ text, saved = [] }: { text: string; saved?: string[] }) {
  const hide = new Set(saved.map((t) => t.toLowerCase()))
  const lines = text
    .split(/\r?\n/)
    .filter((l) => !hide.has((actionText(l) ?? '').toLowerCase()))
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
  if (!lines.length) return null
  if (lines.length === 1) return <p>{lines[0]}</p>
  return (
    <ul className="notulen">
      {lines.map((l, i) => <li key={i}>{l}</li>)}
    </ul>
  )
}

export function ActieRegel({ a, names, me }: { a: Action; names: Map<string, string>; me: string }) {
  const who = a.ownerId ? names.get(a.ownerId) ?? 'een oud collega' : 'Iedereen'
  return (
    <span className="actie-tekst">
      <span style={a.doneAt ? { textDecoration: 'line-through' } : undefined}>{a.text}</span>
      <span className="zacht klein">
        {who}
        {a.dueDate ? `, uiterlijk ${fmtDate(a.dueDate)}` : ''}
      </span>
      {a.ownerId === me && !a.doneAt && <span className="pil">Jij</span>}
      {a.doneAt && <span className="pil goed">Klaar</span>}
    </span>
  )
}

export function OnderwerpRegel({ t, names }: { t: Topic; names: Map<string, string> }) {
  return (
    <span className="stapel" style={{ gap: 2 }}>
      <span>
        <strong>{t.title}</strong>
        {t.status === 'verzoek' && <span className="pil let-op" style={{ marginLeft: 8 }}>Verzoek</span>}
        {t.status === 'niet' && <span className="pil" style={{ marginLeft: 8 }}>Niet deze keer</span>}
      </span>
      {t.explanation && <span className="zacht klein tekstblok">{t.explanation}</span>}
      {t.addedBy && <span className="zacht klein">Ingebracht door {names.get(t.addedBy) ?? 'een oud collega'}</span>}
    </span>
  )
}
