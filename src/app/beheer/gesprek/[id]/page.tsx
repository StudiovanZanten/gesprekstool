import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db, employeeTypes, talks } from '@/db'
import { Antwoord } from '@/components/Antwoord'
import { loadVisibleEmployee, logAccess } from '@/lib/access'
import { requireStaff } from '@/lib/auth'
import { decrypt } from '@/lib/crypto'
import { fmtDate, fmtDateLong, fmtTime } from '@/lib/dates'
import { agreementsOf, lastHeldTalk, slotForTalk, talkAnswers, weekchecksSince } from '@/lib/talks'
import { bewaarVerslag } from './actions'

export default async function Overzicht({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ melding?: string }>
}) {
  const { id } = await params
  const { melding } = await searchParams
  const me = await requireStaff()
  const [talk] = await db.select().from(talks).where(and(eq(talks.id, id), eq(talks.orgId, me.orgId)))
  if (!talk) notFound()
  const emp = await loadVisibleEmployee(me, talk.employeeId)
  if (!emp) notFound()
  await logAccess(me, emp.id, `gespreksoverzicht ${talk.label}`)

  const [type] = emp.typeId ? await db.select().from(employeeTypes).where(eq(employeeTypes.id, emp.typeId)) : []
  const slot = await slotForTalk(talk.id)
  const shared = await talkAnswers(talk.id, true)
  const prev = await lastHeldTalk(emp.id, talk.heldAt ?? undefined)
  const prevAg = prev ? await agreementsOf(prev.id) : []
  const checks = await weekchecksSince(emp.id, prev?.heldAt ?? null, true)
  const ag = await agreementsOf(talk.id)
  const done = talk.status === 'gevoerd'

  return (
    <main>
      <div className="rij tussen">
        <div>
          <h1>{emp.name}</h1>
          <p className="zacht">
            {type?.name}, {talk.label}
            {slot ? `. Gesprek op ${fmtDate(slot.startsAt)} om ${fmtTime(slot.startsAt)}` : '. Nog geen moment gekozen'}
          </p>
        </div>
        <Link href={`/beheer/medewerkers/${emp.id}`} className="knop licht klein">Alle gesprekken</Link>
      </div>
      {melding === 'bewaard' && <div className="melding goed">Bewaard.</div>}
      {melding === 'afgerond' && <div className="melding goed">Het gesprek is afgerond. {emp.name.split(' ')[0]} ziet de afspraken nu ook.</div>}

      {!talk.sharedAt && !done && (
        <div className="melding">{emp.name.split(' ')[0]} heeft de voorbereiding nog niet gedeeld. Je ziet alleen wat zelf gedeeld is.</div>
      )}

      <div className="raster">
        <section className="kaart">
          <h2>Voorbereiding</h2>
          {shared.length ? (
            <div className="lijst">
              {shared.map((a) => (
                <div key={a.id}>
                  <span className="zacht klein">{a.questionText}</span>
                  <br />
                  <Antwoord a={a} />
                </div>
              ))}
            </div>
          ) : (
            <p className="zacht">Nog niets gedeeld.</p>
          )}
        </section>
        <section className="stapel">
          <div className="kaart">
            <h2>Succesjes en tips</h2>
            <p className="zacht klein">Gedeeld uit de weekchecks sinds {prev ? `het vorige gesprek (${fmtDateLong(prev.heldAt)})` : 'het begin'}.</p>
            {checks.length ? (
              <div className="lijst">
                {checks.map((c) => (
                  <div key={c.id} className="stapel">
                    <strong>Week {c.week}</strong>
                    {c.answers.map((a) => (
                      <div key={a.id}>
                        <span className="zacht klein">{a.questionText}</span>
                        <br />
                        <Antwoord a={a} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="zacht">Nog niets gedeeld.</p>
            )}
          </div>
        </section>
      </div>

      {done ? (
        <section className="kaart">
          <h2>Verslag</h2>
          <h3>Wat gaat goed</h3>
          <p>{decrypt(talk.goodEnc) || 'Niet ingevuld.'}</p>
          <h3>Wat vraagt aandacht</h3>
          <p>{decrypt(talk.attentionEnc) || 'Niet ingevuld.'}</p>
          <h3>Afspraken</h3>
          {ag.length ? <ul>{ag.map((a) => <li key={a.id}>{a.text}{a.reviewDate ? `, terugkijken op ${fmtDateLong(a.reviewDate)}` : ''}</li>)}</ul> : <p>Geen.</p>}
        </section>
      ) : (
        <form action={bewaarVerslag.bind(null, talk.id)} className="kaart">
          <h2>Tijdens het gesprek</h2>
          {prevAg.length > 0 && (
            <div className="stapel">
              <h3>Afspraken van de vorige keer</h3>
              {prevAg.map((a) => (
                <label key={a.id} className="schakel">
                  <input type="checkbox" name="gelukt" value={a.id} defaultChecked={a.done} />
                  <span>{a.text} <span className="zacht klein">(aanvinken als het gelukt is)</span></span>
                </label>
              ))}
            </div>
          )}
          <div className="veld">
            <label htmlFor="goed">1. Wat gaat goed?</label>
            <textarea id="goed" name="goed" defaultValue={decrypt(talk.goodEnc)} />
          </div>
          <div className="veld">
            <label htmlFor="aandacht">2. Wat vraagt aandacht?</label>
            <textarea id="aandacht" name="aandacht" defaultValue={decrypt(talk.attentionEnc)} />
          </div>
          <div className="stapel">
            <strong>3. Wat spreken we af? (maximaal drie)</strong>
            {[0, 1, 2].map((i) => (
              <div key={i} className="velden">
                <div className="veld">
                  <label htmlFor={`afspraak-${i}`} className="klein">Afspraak {i + 1}</label>
                  <input id={`afspraak-${i}`} name={`afspraak-${i}`} type="text" defaultValue={ag[i]?.text ?? ''} />
                </div>
                <div className="veld">
                  <label htmlFor={`datum-${i}`} className="klein">Terugkijken op</label>
                  <input id={`datum-${i}`} name={`datum-${i}`} type="date" defaultValue={ag[i]?.reviewDate ?? ''} />
                </div>
              </div>
            ))}
          </div>
          <p className="zacht klein">Wat je hier schrijft, kan {emp.name.split(' ')[0]} na het afronden ook lezen.</p>
          <div className="rij">
            <button className="knop licht" name="afronden" value="0">Tussendoor opslaan</button>
            <button className="knop" name="afronden" value="1">Gesprek afronden</button>
          </div>
        </form>
      )}
    </main>
  )
}
