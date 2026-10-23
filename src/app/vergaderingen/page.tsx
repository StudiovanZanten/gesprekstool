import Link from 'next/link'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { db, meetings } from '@/db'
import { requireUser } from '@/lib/auth'
import { fmtDate } from '@/lib/dates'
import { agendaOf, canLead, colleaguesOf, ensureNextMeeting, openActionsOf } from '@/lib/meetings'
import { actieKlaar, puntToevoegen, puntWeg } from './actions'

const MELDINGEN: Record<string, string> = {
  punt: 'Je punt staat op de agenda.',
}

// Overzicht van het wekelijkse overleg: de agenda van de volgende keer, je eigen actiepunten en eerdere notulen.
export default async function Vergaderingen({ searchParams }: { searchParams: Promise<{ melding?: string }> }) {
  const sp = await searchParams
  const me = await requireUser()
  const next = await ensureNextMeeting(me.orgId)
  const agenda = await agendaOf(next.id)
  const names = new Map((await colleaguesOf(me.orgId)).map((u) => [u.id, u.name]))
  const mine = await openActionsOf(me)
  const earlier = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.orgId, me.orgId), isNotNull(meetings.finishedAt)))
    .orderBy(desc(meetings.date))
    .limit(20)

  return (
    <main>
      <h1>Overleg</h1>
      {sp.melding && MELDINGEN[sp.melding] && <div className="melding goed">{MELDINGEN[sp.melding]}</div>}

      <section className="kaart">
        <div className="rij tussen">
          <div>
            <h2>Volgende overleg</h2>
            <p className="zacht">{fmtDate(next.date)} om {next.time} uur</p>
          </div>
          <Link href={`/vergaderingen/${next.id}`} className="knop">
            {canLead(me) ? 'Open het overleg' : 'Bekijk de agenda'}
          </Link>
        </div>
        <ol className="agenda">
          {agenda.map((it) => (
            <li key={it.id}>
              <div className="rij tussen">
                <strong>{it.title}</strong>
                {!it.fixed && it.addedBy === me.id && (
                  <form action={puntWeg.bind(null, next.id, it.id)}>
                    <input type="hidden" name="terug" value="overzicht" />
                    <button className="knop licht klein">Weghalen</button>
                  </form>
                )}
              </div>
              {it.explanation && <p className="zacht klein tekstblok">{it.explanation}</p>}
              {!it.fixed && it.addedBy && <p className="zacht klein">Ingebracht door {names.get(it.addedBy) ?? 'een oud collega'}</p>}
            </li>
          ))}
        </ol>
      </section>

      <form action={puntToevoegen.bind(null, next.id)} className="kaart tint">
        <h2>Zet een punt op de agenda</h2>
        <input type="hidden" name="terug" value="overzicht" />
        <div className="veld">
          <label htmlFor="nieuw-titel">Waar wil je het over hebben?</label>
          <input id="nieuw-titel" name="nieuw-titel" type="text" maxLength={200} required />
        </div>
        <div className="veld">
          <label htmlFor="nieuw-toelichting">Toelichting (mag leeg blijven)</label>
          <textarea id="nieuw-toelichting" name="nieuw-toelichting" maxLength={2000} style={{ minHeight: 80 }} />
        </div>
        <div><button className="knop">Op de agenda zetten</button></div>
      </form>

      <section className="kaart">
        <h2>Mijn actiepunten</h2>
        {mine.length ? (
          <div className="lijst">
            {mine.map((a) => (
              <div key={a.id} className="rij tussen">
                <div>
                  <p>{a.text}</p>
                  {a.dueDate && <p className="zacht klein">Klaar op {fmtDate(a.dueDate)}</p>}
                </div>
                <form action={actieKlaar.bind(null, a.id, true)}>
                  <button className="knop klein">Klaar</button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <p className="zacht">Je hebt geen open actiepunten.</p>
        )}
      </section>

      <section className="kaart">
        <h2>Eerdere notulen</h2>
        {earlier.length ? (
          <div className="lijst">
            {earlier.map((m) => (
              <Link key={m.id} href={`/vergaderingen/${m.id}`}>Overleg van {fmtDate(m.date)}</Link>
            ))}
          </div>
        ) : (
          <p className="zacht">Er zijn nog geen afgeronde vergaderingen.</p>
        )}
      </section>
    </main>
  )
}
