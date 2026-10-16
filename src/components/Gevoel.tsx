import { Antwoord } from './Antwoord'
import { fmtDateLong } from '@/lib/dates'
import { ANDERS } from '@/lib/questions'
import { SMILEYS, weekchecksSince } from '@/lib/talks'

// Samenvatting van de weekchecks over een periode: hoe voelde iemand zich, wat ging goed, wanneer was er hulp nodig.
// Voor de leidinggevende alleen wat gedeeld is, plus de smiley die altijd zichtbaar is.
export async function Gevoel({ employeeId, since, zelf, titel }: { employeeId: string; since: Date | null; zelf: boolean; titel?: string }) {
  const from = since ?? new Date(Date.now() - 182 * 86400000)
  const checks = (await weekchecksSince(employeeId, from, !zelf)).slice(0, 26).reverse()
  const all = zelf ? checks : await weekchecksSince(employeeId, from, false).then((c) => c.slice(0, 26))
  const mood = checks
    .map((c) => ({ c, s: c.answers.find((a) => a.answerType === 'smiley' && a.smiley != null)?.smiley ?? null }))
    .filter((x): x is { c: (typeof checks)[number]; s: number } => x.s != null)
  const avg = mood.length ? mood.reduce((t, x) => t + x.s, 0) / mood.length : null
  const last = mood.slice(-4)
  const lastAvg = last.length ? last.reduce((t, x) => t + x.s, 0) / last.length : null
  const label = (v: number) => SMILEYS[Math.min(4, Math.max(0, Math.round(v) - 1))]
  const help = all.filter((c) => c.helpRequested).length

  // Overige antwoorden (succesjes, tips, keuzes) per vraag, nieuwste eerst.
  const perVraag = new Map<string, { week: number; a: (typeof checks)[number]['answers'][number] }[]>()
  for (const c of [...checks].reverse()) {
    for (const a of c.answers) {
      if (a.answerType === 'smiley' || (!a.value && !a.note)) continue
      perVraag.set(a.questionText, [...(perVraag.get(a.questionText) ?? []), { week: c.week, a }])
    }
  }

  return (
    <section className="kaart">
      <h2>{titel ?? (zelf ? 'Hoe ging het met mij' : 'Hoe gaat het')}</h2>
      <p className="zacht klein">
        Sinds {since ? fmtDateLong(since) : 'een half jaar geleden'}: {all.length} {all.length === 1 ? 'weekcheck' : 'weekchecks'} ingevuld
        {help ? `, ${help} keer om hulp gevraagd` : ''}.
      </p>
      {mood.length ? (
        <>
          <p>
            Gemiddeld: <strong>{label(avg!).emoji} {label(avg!).label}</strong>
            {mood.length > 4 && lastAvg != null && (
              <>. De laatste vier weken: <strong>{label(lastAvg).emoji} {label(lastAvg).label}</strong></>
            )}
          </p>
          <div className="gevoel" aria-label="Gevoel per week">
            {mood.map(({ c, s }) => (
              <span key={c.id} title={`Week ${c.week}: ${SMILEYS[s - 1].label}`}>
                <b>{SMILEYS[s - 1].emoji}</b>wk {c.week}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="zacht">Nog geen smileys in deze periode.</p>
      )}
      {[...perVraag.entries()].map(([q, list]) => {
        const keuze = list[0].a.answerType === 'keuze'
        const counts = keuze
          ? [...list.reduce((m, { a }) => m.set(a.value === ANDERS ? 'Anders' : a.value, (m.get(a.value === ANDERS ? 'Anders' : a.value) ?? 0) + 1), new Map<string, number>())]
          : []
        return (
          <details key={q}>
            <summary className="klein"><strong>{q}</strong> ({list.length})</summary>
            {keuze && (
              <ul className="klein">{counts.map(([v, n]) => <li key={v}>{v} {n}x</li>)}</ul>
            )}
            <div className="lijst">
              {list.map(({ week, a }) => (
                <div key={a.id} className="klein"><span className="zacht">Week {week}: </span><Antwoord a={a} /></div>
              ))}
            </div>
          </details>
        )
      })}
      {!zelf && <p className="zacht klein">Teksten zie je alleen als de medewerker ze gedeeld heeft. De smiley zie je altijd.</p>}
    </section>
  )
}
