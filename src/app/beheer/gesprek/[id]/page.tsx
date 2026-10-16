import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db, employeeTypes, talks } from '@/db'
import { Antwoord } from '@/components/Antwoord'
import { Gevoel } from '@/components/Gevoel'
import { loadVisibleEmployee, logAccess } from '@/lib/access'
import { requireStaff } from '@/lib/auth'
import { decrypt } from '@/lib/crypto'
import { fmtDate, fmtDateLong, fmtTime } from '@/lib/dates'
import { EIGENAREN, STATUSSEN, VOORBEREIDING_LEIDING } from '@/lib/questions'
import { agreementsOf, hostPrep, lastHeldTalk, slotForTalk, talkAnswers } from '@/lib/talks'
import { bewaarVerslag, bewaarVoorbereidingLeiding } from './actions'

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
  const ag = await agreementsOf(talk.id)
  const prep = hostPrep(talk)
  const done = talk.status === 'gevoerd'
  const voornaam = emp.name.split(' ')[0]

  const prepForm = (
    <form action={bewaarVoorbereidingLeiding.bind(null, talk.id)} className="stapel">
      {prevAg.length > 0 && (
        <div className="melding klein">
          <strong>Afspraken van de vorige keer</strong>
          <ul>{prevAg.map((a) => <li key={a.id}>{a.text}: {STATUSSEN[a.status] ?? a.status}</li>)}</ul>
        </div>
      )}
      {VOORBEREIDING_LEIDING.map((v, i) => (
        <div key={v.key} className="veld">
          <label htmlFor={`lv-${v.key}`}>{i + 1}. {v.vraag}</label>
          <textarea id={`lv-${v.key}`} name={v.key} defaultValue={prep[v.key] ?? ''} />
        </div>
      ))}
      <div><button className="knop licht">Voorbereiding bewaren</button></div>
    </form>
  )

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
        <Link href={`/beheer/medewerkers/${emp.id}`} className="knop licht klein">Profiel</Link>
      </div>
      {melding === 'bewaard' && <div className="melding goed">Bewaard.</div>}
      {melding === 'voorbereid' && <div className="melding goed">Je voorbereiding is bewaard. {voornaam} ziet die niet.</div>}

      {!talk.sharedAt && !done && (
        <div className="melding">{voornaam} heeft de voorbereiding nog niet gedeeld. Je ziet alleen wat zelf gedeeld is.</div>
      )}

      <div className="raster">
        <section className="kaart">
          <h2>Voorbereiding van {voornaam}</h2>
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
        <Gevoel employeeId={emp.id} since={prev?.heldAt ?? null} zelf={false} titel={`Hoe gaat het met ${voornaam}`} />
      </div>

      {done ? (
        <>
          <section className="kaart">
            <div className="rij tussen">
              <h2>Verslag</h2>
              <Link href={`/verslag/${talk.id}`} className="knop klein">Verslag bekijken</Link>
            </div>
            <p className="rij" style={{ gap: 6 }}>
              {talk.hostConfirmedAt ? <span className="pil goed">Gelezen door leidinggevende</span> : <span className="pil let-op">Nog niet bevestigd door leidinggevende</span>}
              {talk.employeeConfirmedAt ? <span className="pil goed">Gelezen door {voornaam}</span> : <span className="pil let-op">{voornaam} heeft nog niet bevestigd</span>}
            </p>
          </section>
          <details className="kaart" id="voorbereiding">
            <summary><strong>Mijn voorbereiding</strong> <span className="zacht klein">(alleen voor leidinggevenden)</span></summary>
            {VOORBEREIDING_LEIDING.map((v) => (
              <div key={v.key}>
                <h3>{v.vraag}</h3>
                <p>{prep[v.key] || 'Niet ingevuld.'}</p>
              </div>
            ))}
          </details>
        </>
      ) : (
        <>
          <details className="kaart" id="voorbereiding" open={melding === 'voorbereid' || !Object.values(prep).some(Boolean)}>
            <summary><strong>Mijn voorbereiding</strong> <span className="zacht klein">(alleen voor leidinggevenden, {voornaam} ziet dit niet)</span></summary>
            {prepForm}
          </details>

          <form action={bewaarVerslag.bind(null, talk.id)} className="kaart">
            <h2>Tijdens het gesprek</h2>
            {prevAg.length > 0 && (
              <div className="stapel">
                <h3>Afspraken van de vorige keer</h3>
                {prevAg.map((a) => (
                  <div key={a.id} className="velden twee">
                    <span>{a.text}{a.reviewDate ? <span className="zacht klein"><br />Streefdatum {fmtDateLong(a.reviewDate)}</span> : null}</span>
                    <select name={`vorig-${a.id}`} defaultValue={a.status} aria-label={`Voortgang: ${a.text}`}>
                      {Object.entries(STATUSSEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
            <div className="veld">
              <label htmlFor="onderwerpen">1. Waar hebben we het over gehad?</label>
              <textarea id="onderwerpen" name="onderwerpen" defaultValue={decrypt(talk.topicsEnc)} />
            </div>
            <div className="veld">
              <label htmlFor="goed">2. Wat gaat goed?</label>
              <textarea id="goed" name="goed" defaultValue={decrypt(talk.goodEnc)} />
            </div>
            <div className="veld">
              <label htmlFor="aandacht">3. Wat vraagt aandacht?</label>
              <textarea id="aandacht" name="aandacht" defaultValue={decrypt(talk.attentionEnc)} />
            </div>
            <div className="veld">
              <label htmlFor="doelen">4. Ontwikkeldoelen</label>
              <textarea id="doelen" name="doelen" defaultValue={decrypt(talk.goalsEnc)} />
            </div>
            <div className="stapel">
              <strong>5. Wat spreken we af? (maximaal drie)</strong>
              {[0, 1, 2].map((i) => (
                <div key={i} className="afspraak">
                  <div className="veld">
                    <label htmlFor={`afspraak-${i}`} className="klein">Afspraak {i + 1}</label>
                    <input id={`afspraak-${i}`} name={`afspraak-${i}`} type="text" defaultValue={ag[i]?.text ?? ''} />
                  </div>
                  <div className="velden drie">
                    <div className="veld">
                      <label htmlFor={`wie-${i}`} className="klein">Wie zorgt ervoor</label>
                      <select id={`wie-${i}`} name={`wie-${i}`} defaultValue={ag[i]?.owner ?? 'medewerker'}>
                        {Object.entries(EIGENAREN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div className="veld">
                      <label htmlFor={`datum-${i}`} className="klein">Streefdatum</label>
                      <input id={`datum-${i}`} name={`datum-${i}`} type="date" defaultValue={ag[i]?.reviewDate ?? ''} />
                    </div>
                    <div className="veld">
                      <label htmlFor={`status-${i}`} className="klein">Voortgang</label>
                      <select id={`status-${i}`} name={`status-${i}`} defaultValue={ag[i]?.status ?? 'nog_niet'}>
                        {Object.entries(STATUSSEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="veld" style={{ maxWidth: 320 }}>
              <label htmlFor="volgend">6. Datum volgend gesprek</label>
              <input id="volgend" name="volgend" type="date" defaultValue={talk.nextTalkDate ?? ''} />
            </div>
            <p className="zacht klein">Wat je hier schrijft, kan {voornaam} na het afronden lezen in het verslag. Je voorbereiding hierboven niet.</p>
            <div className="rij">
              <button className="knop licht" name="afronden" value="0">Tussendoor opslaan</button>
              <button className="knop" name="afronden" value="1">Gesprek afronden</button>
            </div>
          </form>
        </>
      )}
    </main>
  )
}
