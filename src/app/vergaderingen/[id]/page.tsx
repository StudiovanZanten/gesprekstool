import Link from 'next/link'
import { notFound } from 'next/navigation'
import { NietBewaard } from '@/components/NietBewaard'
import { PrintKnop } from '@/components/PrintKnop'
import { requireUser } from '@/lib/auth'
import { sha256 } from '@/lib/crypto'
import { fmtDate, fmtDateLong } from '@/lib/dates'
import { actionsOfMeeting, agendaOf, canLead, colleaguesOf, loadMeeting, openActionsBefore, presentOf, type Action } from '@/lib/meetings'
import {
  actieKlaar,
  actieToevoegen,
  actieWeg,
  afronden,
  bewaar,
  heropenen,
  puntToevoegen,
  puntVerplaatsen,
  puntWeg,
} from '../actions'

const MELDINGEN: Record<string, [string, string]> = {
  bewaard: ['goed', 'Bewaard.'],
  punt: ['goed', 'Het punt staat op de agenda.'],
  afgerond: ['goed', 'Het overleg is afgerond. Iedereen heeft een mail gekregen dat de notulen klaarstaan.'],
  'datum-bezet': ['fout', 'Op die datum staat al een overleg. De datum is niet aangepast.'],
  'punt-leeg': ['fout', 'Vul eerst in waar het punt over gaat.'],
  'actie-leeg': ['fout', 'Vul eerst in wat er moet gebeuren.'],
}

export default async function Vergadering({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ melding?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const me = await requireUser()
  const m = await loadMeeting(me, id)
  if (!m) notFound()
  const agenda = await agendaOf(m.id)
  const actions = await actionsOfMeeting(m.id)
  const people = await colleaguesOf(m.orgId)
  const names = new Map(people.map((u) => [u.id, u.name]))
  const present = presentOf(m)
  const editing = canLead(me) && !m.finishedAt
  const earlierOpen = editing ? await openActionsBefore(m.orgId, m.date) : []
  const melding = sp.melding ? MELDINGEN[sp.melding] : undefined
  // Na elke knop zet React het formulier terug. Met een nieuwe sleutel bij nieuwe inhoud toont het altijd wat er bewaard is.
  const formKey = sha256(JSON.stringify([m, agenda, actions.map((a) => [a.id, a.doneAt]), earlierOpen.map((a) => a.id)]))
  const who = (a: Action) => (a.ownerId ? names.get(a.ownerId) ?? 'een oud collega' : 'iedereen')
  const actionLine = (a: Action) => (
    <>
      <span style={a.doneAt ? { textDecoration: 'line-through' } : undefined}>{a.text}</span>
      <span className="zacht klein">
        {' '}{who(a)}{a.dueDate ? `, uiterlijk ${fmtDate(a.dueDate)}` : ''}
      </span>
      {a.doneAt && <span className="pil goed">Klaar</span>}
    </>
  )

  if (!editing) {
    const done = !!m.finishedAt
    return (
      <main>
        <p className="klein geen-print"><Link href="/vergaderingen">Terug naar het overleg</Link></p>
        <div className="rij tussen">
          <div>
            <h1>{done ? 'Notulen' : 'Agenda'}</h1>
            <p className="zacht">Overleg van {fmtDateLong(m.date)} om {m.time} uur</p>
          </div>
          <div className="rij geen-print">
            {done && <PrintKnop />}
            {done && canLead(me) && (
              <form action={heropenen.bind(null, m.id)}>
                <button className="knop licht klein">Notulen aanpassen</button>
              </form>
            )}
          </div>
        </div>
        {melding && <div className={`melding ${melding[0]}`}>{melding[1]}</div>}
        {done && present.length > 0 && (
          <p><strong>Aanwezig:</strong> {present.map((p) => names.get(p)).filter(Boolean).join(', ')}</p>
        )}
        <section className="kaart">
          <ol className="agenda">
            {agenda.map((it) => (
              <li key={it.id}>
                <div className="rij tussen">
                  <h3>{it.title}</h3>
                  {!done && !it.fixed && it.addedBy === me.id && (
                    <form action={puntWeg.bind(null, m.id, it.id)} className="geen-print">
                      <button className="knop licht klein">Weghalen</button>
                    </form>
                  )}
                </div>
                {it.explanation && <p className="zacht tekstblok">{it.explanation}</p>}
                {!it.fixed && it.addedBy && <p className="zacht klein">Ingebracht door {names.get(it.addedBy) ?? 'een oud collega'}</p>}
                {done && it.notes && <p className="tekstblok">{it.notes}</p>}
                {done && it.decision && <p className="besluit"><strong>Besluit:</strong> {it.decision}</p>}
                {done && actions.filter((a) => a.itemId === it.id).length > 0 && (
                  <ul className="acties">
                    {actions.filter((a) => a.itemId === it.id).map((a) => <li key={a.id}>{actionLine(a)}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
        {!done && (
          <>
            <p className="zacht">De notulen verschijnen hier na het overleg.</p>
            <form action={puntToevoegen.bind(null, m.id)} className="kaart tint geen-print">
              <h2>Zet een punt op de agenda</h2>
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
          </>
        )}
      </main>
    )
  }

  // Het notulenscherm voor de leiding. Alles staat in één formulier: elke knop bewaart eerst wat er is getypt.
  return (
    <main>
      <p className="klein"><Link href="/vergaderingen">Terug naar het overleg</Link></p>
      <div>
        <h1>Overleg van {fmtDate(m.date)}</h1>
        <p className="zacht">Typ de notulen per punt. Bewaar tussendoor, of gebruik een van de knoppen: die bewaren ook.</p>
      </div>
      {melding && <div className={`melding ${melding[0]}`}>{melding[1]}</div>}

      <form key={formKey} id="notulen" action={bewaar.bind(null, m.id)} className="stapel" style={{ gap: 24 }}>
        <input type="hidden" name="notulenscherm" value="1" />
        <input type="hidden" name="vergadering" value={m.id} />
        <NietBewaard formId="notulen" />

        <section className="kaart">
          <div className="velden twee">
            <div className="veld"><label htmlFor="datum">Datum</label><input id="datum" name="datum" type="date" defaultValue={m.date} /></div>
            <div className="veld"><label htmlFor="tijd">Tijd</label><input id="tijd" name="tijd" type="time" defaultValue={m.time} /></div>
          </div>
          <fieldset className="dagen">
            <legend>Wie zijn er?</legend>
            {people.map((u) => (
              <label key={u.id} className="dag">
                <input type="checkbox" name="aanwezig" value={u.id} defaultChecked={present.includes(u.id)} />
                <span>{u.name}</span>
              </label>
            ))}
          </fieldset>
        </section>

        {earlierOpen.length > 0 && (
          <section className="kaart tint">
            <h2>Actiepunten van eerder</h2>
            <p className="zacht klein">Deze staan nog open. Vink af wat klaar is, de rest komt volgende keer weer terug.</p>
            <div className="lijst">
              {earlierOpen.map((a) => (
                <div key={a.id} className="rij tussen">
                  <div>{actionLine(a)}</div>
                  <button formAction={actieKlaar.bind(null, a.id, true)} className="knop klein">Klaar</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {agenda.map((it, i) => {
          const own = actions.filter((a) => a.itemId === it.id)
          return (
            <section key={it.id} id={`punt-${it.id}`} className="kaart">
              <div className="rij tussen">
                <h2>{i + 1}. {it.title}</h2>
                <div className="rij" style={{ gap: 6 }}>
                  <button formAction={puntVerplaatsen.bind(null, m.id, it.id, -1)} className="knop licht klein" disabled={i === 0} aria-label="Punt omhoog">Omhoog</button>
                  <button formAction={puntVerplaatsen.bind(null, m.id, it.id, 1)} className="knop licht klein" disabled={i === agenda.length - 1} aria-label="Punt omlaag">Omlaag</button>
                  <button formAction={puntWeg.bind(null, m.id, it.id)} className="knop licht klein">Weghalen</button>
                </div>
              </div>
              {it.explanation && <p className="zacht tekstblok">{it.explanation}</p>}
              {!it.fixed && it.addedBy && <p className="zacht klein">Ingebracht door {names.get(it.addedBy) ?? 'een oud collega'}</p>}
              <div className="veld">
                <label htmlFor={`notulen-${it.id}`}>Notulen</label>
                <textarea id={`notulen-${it.id}`} name={`notulen-${it.id}`} defaultValue={it.notes} />
              </div>
              <div className="veld">
                <label htmlFor={`besluit-${it.id}`}>Besluit (mag leeg blijven)</label>
                <input id={`besluit-${it.id}`} name={`besluit-${it.id}`} type="text" defaultValue={it.decision} />
              </div>
              {own.length > 0 && (
                <div className="lijst">
                  {own.map((a) => (
                    <div key={a.id} className="rij tussen">
                      <div>{actionLine(a)}</div>
                      <button formAction={actieWeg.bind(null, m.id, a.id)} className="knop licht klein">Weghalen</button>
                    </div>
                  ))}
                </div>
              )}
              <details className="actie-open">
                <summary>Actiepunt toevoegen</summary>
                <div className="velden drie">
                  <div className="veld"><label htmlFor={`actie-${it.id}`} className="klein">Wat moet er gebeuren?</label><input id={`actie-${it.id}`} name={`actie-${it.id}`} type="text" maxLength={1000} /></div>
                  <div className="veld">
                    <label htmlFor={`wie-${it.id}`} className="klein">Wie</label>
                    <select id={`wie-${it.id}`} name={`wie-${it.id}`} defaultValue="">
                      <option value="">Iedereen</option>
                      {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div className="veld"><label htmlFor={`wanneer-${it.id}`} className="klein">Wanneer klaar</label><input id={`wanneer-${it.id}`} name={`wanneer-${it.id}`} type="date" /></div>
                </div>
                <div style={{ marginTop: 12 }}><button formAction={actieToevoegen.bind(null, m.id, it.id)} className="knop klein">Toevoegen</button></div>
              </details>
            </section>
          )
        })}

        <section className="kaart tint">
          <h2>Punt toevoegen</h2>
          <div className="velden twee">
            <div className="veld"><label htmlFor="nieuw-titel">Onderwerp</label><input id="nieuw-titel" name="nieuw-titel" type="text" maxLength={200} /></div>
            <div className="veld"><label htmlFor="nieuw-toelichting">Toelichting</label><input id="nieuw-toelichting" name="nieuw-toelichting" type="text" maxLength={2000} /></div>
          </div>
          <div><button formAction={puntToevoegen.bind(null, m.id)} className="knop licht klein">Toevoegen</button></div>
        </section>

        <div className="balk">
          <button className="knop licht">Bewaren</button>
          <button formAction={afronden.bind(null, m.id)} className="knop">Afronden en notulen delen</button>
        </div>
      </form>
    </main>
  )
}
