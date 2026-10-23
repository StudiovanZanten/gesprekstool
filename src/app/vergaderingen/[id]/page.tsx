import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AutoVernieuwen } from '@/components/AutoVernieuwen'
import { NietBewaard } from '@/components/NietBewaard'
import { ActieRegel, Notulen, OnderwerpRegel, Privacy, PRIVACY_TEKST } from '@/components/Overleg'
import { PrintKnop } from '@/components/PrintKnop'
import { requireUser } from '@/lib/auth'
import { sha256 } from '@/lib/crypto'
import { fmtDate, fmtDateLong, isoWeek } from '@/lib/dates'
import { recognise } from '@/lib/herkennen'
import {
  actionsOfMeeting,
  agendaOf,
  canEdit,
  isChair,
  isPrivacyItem,
  loadMeeting,
  openActionsBefore,
  presentOf,
  teamOf,
  topicsOf,
  type Topic,
} from '@/lib/meetings'
import {
  actieKlaar,
  actieToevoegen,
  actieWeg,
  afronden,
  bevestigen,
  bewaar,
  herkennen,
  heropenen,
  naarPunt,
  onderwerpInbrengen,
  onderwerpWeg,
  puntToevoegen,
  puntVerplaatsen,
  puntWeg,
  verzoekBeslissen,
} from '../actions'

const MELDINGEN: Record<string, [string, string]> = {
  bewaard: ['goed', 'Bewaard.'],
  ingebracht: ['goed', 'Je onderwerp is ingebracht.'],
  afgerond: ['goed', 'Het overleg is afgerond. Ieder teamlid krijgt een mail met de eigen actiepunten.'],
  'datum-bezet': ['fout', 'Op die datum staat al een overleg. De datum is niet aangepast.'],
  leeg: ['fout', 'Vul eerst een onderwerp in.'],
  'actie-leeg': ['fout', 'Vul eerst in wat er moet gebeuren.'],
}

export default async function Vergadering({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ melding?: string; herken?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const me = await requireUser()
  const m = await loadMeeting(me, id)
  if (!m) notFound()
  const agenda = await agendaOf(m.id)
  const topics = await topicsOf(m.id)
  const actions = await actionsOfMeeting(m.id)
  const team = await teamOf(m.orgId)
  const names = new Map(team.map((u) => [u.id, u.name]))
  const present = presentOf(m)
  const chair = isChair(me)
  const editing = canEdit(me, m)
  const done = !!m.finishedAt
  const earlierOpen = done ? [] : await openActionsBefore(m.orgId, m.date, new Date(m.date + 'T00:00:00Z'))
  const melding = sp.melding ? MELDINGEN[sp.melding] : undefined
  const current = agenda.findIndex((i) => i.id === m.currentItemId)
  const week = isoWeek(new Date(m.date + 'T12:00:00Z')).week
  const visible = (t: Topic) => t.status === 'akkoord' || t.addedBy === me.id || (chair && t.status === 'verzoek')

  if (!editing) {
    const live = !done && current >= 0
    return (
      <main>
        {live && <AutoVernieuwen />}
        <p className="klein geen-print"><Link href="/vergaderingen">Terug naar het overzicht</Link></p>
        <div className="rij tussen">
          <div>
            <h1>{done ? 'Notulen' : live ? 'Het overleg is bezig' : 'Agenda'}</h1>
            <p className="zacht">Wekelijkse meeting, week {week}, {fmtDateLong(m.date)} om {m.time} uur</p>
          </div>
          <div className="rij geen-print">
            {done && <PrintKnop />}
            {done && chair && (
              <form action={heropenen.bind(null, m.id)}>
                <button className="knop licht klein">Notulen aanpassen</button>
              </form>
            )}
          </div>
        </div>
        {melding && <div className={`melding ${melding[0]}`}>{melding[1]}</div>}
        {live && <div className="melding goed">Nu aan de beurt: <strong>{agenda[current].title}</strong>. Dit scherm ververst vanzelf.</div>}
        {present.length > 0 && <p><strong>Aanwezig:</strong> {present.map((p) => names.get(p)).filter(Boolean).join(', ')}</p>}
        {m.minuteTakerId && names.get(m.minuteTakerId) && <p><strong>Notulist:</strong> {names.get(m.minuteTakerId)}</p>}

        {earlierOpen.length > 0 && (
          <section className="kaart tint" id="eerder">
            <h2>Actiepunten van eerder</h2>
            <div className="lijst">
              {earlierOpen.map((a) => (
                <div key={a.id} className="rij tussen">
                  <ActieRegel a={a} names={names} me={me.id} />
                  <form action={actieKlaar.bind(null, a.id, !a.doneAt)} className="geen-print">
                    <input type="hidden" name="vergadering" value={m.id} />
                    <button className={a.doneAt ? 'knop licht klein' : 'knop klein'}>{a.doneAt ? 'Toch niet klaar' : 'Klaar'}</button>
                  </form>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="kaart">
          <ol className="agenda">
            {agenda.map((it) => {
              const own = actions.filter((a) => a.itemId === it.id)
              return (
                <li key={it.id} id={`punt-${it.id}`} className={it.id === m.currentItemId ? 'nu' : undefined}>
                  <div className="rij" style={{ gap: 8 }}>
                    <h3>{it.title}</h3>
                    {it.owner && <span className="pil">{it.owner}</span>}
                    {it.id === m.currentItemId && <span className="pil goed">Nu aan de beurt</span>}
                  </div>
                  {topics.filter((t) => t.itemId === it.id && visible(t) && (!done || t.status === 'akkoord')).map((t) => (
                    <div key={t.id} className="onderwerp">
                      <OnderwerpRegel t={t} names={names} />
                      {!done && t.addedBy === me.id && t.status !== 'akkoord' && (
                        <form action={onderwerpWeg.bind(null, t.id)} className="geen-print">
                          <button className="knop licht klein">Weghalen</button>
                        </form>
                      )}
                    </div>
                  ))}
                  <Notulen text={it.notes} saved={own.map((a) => a.text)} />
                  {it.decision && <p className="besluit"><strong>Besluit:</strong> {it.decision}</p>}
                  {own.length > 0 && (
                    <div className="lijst">
                      {own.map((a) => (
                        <div key={a.id} className="rij tussen">
                          <ActieRegel a={a} names={names} me={me.id} />
                          <form action={actieKlaar.bind(null, a.id, !a.doneAt)} className="geen-print">
                            <input type="hidden" name="vergadering" value={m.id} />
                            <button className={a.doneAt ? 'knop licht klein' : 'knop klein'}>{a.doneAt ? 'Toch niet klaar' : 'Klaar'}</button>
                          </form>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </section>

        {!done && (
          <form action={onderwerpInbrengen.bind(null, m.id)} className="kaart tint geen-print">
            <h2>Onderwerp inbrengen</h2>
            <div className="veld">
              <label htmlFor="agendapunt">Bij welk agendapunt?</label>
              <select id="agendapunt" name="agendapunt" defaultValue={agenda.find((i) => /rondvraag/i.test(i.title))?.id}>
                {agenda.map((it) => <option key={it.id} value={it.id}>{it.title}</option>)}
              </select>
              <span className="hint">Bij Zorg, dagbesteding: {PRIVACY_TEKST.toLowerCase()}</span>
            </div>
            <div className="veld">
              <label htmlFor="onderwerp">Waar wil je het over hebben?</label>
              <input id="onderwerp" name="onderwerp" type="text" maxLength={200} required />
            </div>
            <div className="veld">
              <label htmlFor="toelichting">Toelichting (mag leeg blijven)</label>
              <textarea id="toelichting" name="toelichting" maxLength={2000} style={{ minHeight: 80 }} />
            </div>
            <div><button className="knop">Inbrengen</button></div>
          </form>
        )}
      </main>
    )
  }

  // Het notulenscherm voor de voorzitter en de notulist. Alles staat in één formulier: elke knop bewaart eerst wat er is getypt.
  // Na elke knop zet React het formulier terug. Met een nieuwe sleutel bij nieuwe inhoud toont het altijd wat er bewaard is.
  const formKey = sha256(JSON.stringify([m, agenda, topics, actions.map((a) => [a.id, a.doneAt]), earlierOpen.map((a) => [a.id, a.doneAt]), sp.herken]))
  const existing = new Set(actions.map((a) => a.text.toLowerCase()))
  const prev = current > 0 ? agenda[current - 1] : null
  const next = current >= 0 ? agenda[current + 1] ?? null : null

  return (
    <main>
      <p className="klein"><Link href="/vergaderingen">Terug naar het overzicht</Link></p>
      <div>
        <h1>Overleg week {week}</h1>
        <p className="zacht">{fmtDate(m.date)} om {m.time} uur. Typ per punt korte aantekeningen. Elke knop bewaart ook wat je typte.</p>
      </div>
      {melding && <div className={`melding ${melding[0]}`}>{melding[1]}</div>}

      <form key={formKey} id="notulen" action={bewaar.bind(null, m.id)} className="stapel" style={{ gap: 24 }}>
        <input type="hidden" name="notulenscherm" value="1" />
        <input type="hidden" name="vergadering" value={m.id} />
        <NietBewaard formId="notulen" />

        <section className="kaart">
          {chair && (
            <div className="velden drie">
              <div className="veld"><label htmlFor="datum">Datum</label><input id="datum" name="datum" type="date" defaultValue={m.date} /></div>
              <div className="veld"><label htmlFor="tijd">Tijd</label><input id="tijd" name="tijd" type="time" defaultValue={m.time} /></div>
              <div className="veld">
                <label htmlFor="notulist">Notulist</label>
                <select id="notulist" name="notulist" defaultValue={m.minuteTakerId ?? ''}>
                  <option value="">Ik notuleer zelf</option>
                  {team.filter((u) => u.id !== me.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <span className="hint">Kies je iemand en klik je op Bewaren, dan krijgt diegene een mail en kan meteen notuleren.</span>
              </div>
            </div>
          )}
          <fieldset className="dagen">
            <legend>Wie zijn er?</legend>
            {team.map((u) => (
              <label key={u.id} className="dag">
                <input type="checkbox" name="aanwezig" value={u.id} defaultChecked={present.includes(u.id)} />
                <span>{u.name}</span>
              </label>
            ))}
          </fieldset>
        </section>

        {earlierOpen.length > 0 && (
          <section className="kaart tint" id="eerder">
            <h2>Actiepunten van eerder</h2>
            <p className="zacht klein">Vink af wat klaar is. De rest komt volgende keer weer terug.</p>
            <div className="lijst">
              {earlierOpen.map((a) => (
                <div key={a.id} className="rij tussen">
                  <ActieRegel a={a} names={names} me={me.id} />
                  <button formAction={actieKlaar.bind(null, a.id, !a.doneAt)} className={a.doneAt ? 'knop licht klein' : 'knop klein'}>
                    {a.doneAt ? 'Toch niet klaar' : 'Klaar'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {agenda.map((it, i) => {
          const own = actions.filter((a) => a.itemId === it.id)
          const itemTopics = topics.filter((t) => t.itemId === it.id && visible(t))
          const proposals = sp.herken === it.id ? recognise(it.notes, m.date, team).filter((p) => !existing.has(p.text.toLowerCase())) : null
          const isNow = it.id === m.currentItemId
          return (
            <section key={it.id} id={`punt-${it.id}`} className={isNow ? 'kaart nu' : 'kaart'}>
              <div className="rij tussen">
                <div className="rij" style={{ gap: 8 }}>
                  <h2>{i + 1}. {it.title}</h2>
                  {it.owner && <span className="pil">{it.owner}</span>}
                  {isNow && <span className="pil goed">Nu aan de beurt</span>}
                </div>
                <div className="rij" style={{ gap: 6 }}>
                  {!isNow && <button formAction={naarPunt.bind(null, m.id, it.id)} className="knop licht klein">Naar dit punt</button>}
                  {chair && (
                    <>
                      <button formAction={puntVerplaatsen.bind(null, m.id, it.id, -1)} className="knop licht klein" disabled={i === 0}>Omhoog</button>
                      <button formAction={puntVerplaatsen.bind(null, m.id, it.id, 1)} className="knop licht klein" disabled={i === agenda.length - 1}>Omlaag</button>
                      <button formAction={puntWeg.bind(null, m.id, it.id)} className="knop licht klein">Weghalen</button>
                    </>
                  )}
                </div>
              </div>
              {itemTopics.length > 0 && (
                <div className="stapel" style={{ gap: 0 }}>
                  {itemTopics.map((t) => (
                    <div key={t.id} className="onderwerp">
                      <OnderwerpRegel t={t} names={names} />
                      {chair && (
                        <div className="rij" style={{ gap: 6 }}>
                          {t.status !== 'akkoord' && <button formAction={verzoekBeslissen.bind(null, t.id, 'akkoord')} className="knop klein">Op de agenda</button>}
                          {t.status !== 'niet' && <button formAction={verzoekBeslissen.bind(null, t.id, 'niet')} className="knop licht klein">Niet deze keer</button>}
                          <button formAction={onderwerpWeg.bind(null, t.id)} className="knop licht klein">Weghalen</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isPrivacyItem(it.title) && <Privacy />}
              <div className="veld">
                <label htmlFor={`notulen-${it.id}`}>Aantekeningen</label>
                <textarea id={`notulen-${it.id}`} name={`notulen-${it.id}`} defaultValue={it.notes} />
                <span className="hint">Eén punt per regel. Begin een regel met Actie: om er een actiepunt van te maken, bijvoorbeeld: Actie: Eva belt de Brabantse Hoeve voor vrijdag.</span>
              </div>
              <div className="veld">
                <label htmlFor={`besluit-${it.id}`}>Besluit (mag leeg blijven)</label>
                <input id={`besluit-${it.id}`} name={`besluit-${it.id}`} type="text" defaultValue={it.decision} />
              </div>
              {own.length > 0 && (
                <div className="lijst">
                  {own.map((a) => (
                    <div key={a.id} className="rij tussen">
                      <ActieRegel a={a} names={names} me={me.id} />
                      <div className="rij" style={{ gap: 6 }}>
                        <button formAction={actieKlaar.bind(null, a.id, !a.doneAt)} className="knop licht klein">{a.doneAt ? 'Toch niet klaar' : 'Klaar'}</button>
                        <button formAction={actieWeg.bind(null, m.id, a.id)} className="knop licht klein">Weghalen</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {proposals && (
                <div className="kaart tint voorstel">
                  <h3>Gevonden actiepunten</h3>
                  {proposals.length ? (
                    <>
                      <p className="zacht klein">Kijk ze na, pas aan waar nodig en vink uit wat geen actiepunt is.</p>
                      <input type="hidden" name={`voorstellen-${it.id}`} value={proposals.length} />
                      {proposals.map((p, n) => {
                        const k = `v-${it.id}-${n}`
                        return (
                          <div key={k} className="stapel" style={{ gap: 8 }}>
                            <label className="schakel"><input type="checkbox" name={`${k}-aan`} defaultChecked /> Opslaan als actiepunt</label>
                            <div className="velden drie">
                              <div className="veld"><label htmlFor={`${k}-tekst`} className="klein">Wat</label><input id={`${k}-tekst`} name={`${k}-tekst`} type="text" defaultValue={p.text} /></div>
                              <div className="veld">
                                <label htmlFor={`${k}-wie`} className="klein">Wie</label>
                                <select id={`${k}-wie`} name={`${k}-wie`} defaultValue={p.ownerId ?? ''}>
                                  <option value="">Iedereen</option>
                                  {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                              </div>
                              <div className="veld"><label htmlFor={`${k}-wanneer`} className="klein">Wanneer klaar</label><input id={`${k}-wanneer`} name={`${k}-wanneer`} type="date" defaultValue={p.dueDate ?? ''} /></div>
                            </div>
                          </div>
                        )
                      })}
                      <div><button formAction={bevestigen.bind(null, m.id, it.id)} className="knop">Bevestigen en opslaan</button></div>
                    </>
                  ) : (
                    <p className="zacht">Geen nieuwe actiepunten gevonden. Begin een regel met Actie: en probeer het opnieuw.</p>
                  )}
                </div>
              )}
              <div className="rij">
                <button formAction={herkennen.bind(null, m.id, it.id)} className="knop licht klein">Actiepunten herkennen</button>
              </div>
              <details className="actie-open">
                <summary>Zelf een actiepunt toevoegen</summary>
                <div className="velden drie">
                  <div className="veld"><label htmlFor={`actie-${it.id}`} className="klein">Wat moet er gebeuren?</label><input id={`actie-${it.id}`} name={`actie-${it.id}`} type="text" maxLength={1000} /></div>
                  <div className="veld">
                    <label htmlFor={`wie-${it.id}`} className="klein">Wie</label>
                    <select id={`wie-${it.id}`} name={`wie-${it.id}`} defaultValue="">
                      <option value="">Iedereen</option>
                      {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div className="veld"><label htmlFor={`wanneer-${it.id}`} className="klein">Wanneer klaar</label><input id={`wanneer-${it.id}`} name={`wanneer-${it.id}`} type="date" /></div>
                </div>
                <div style={{ marginTop: 12 }}><button formAction={actieToevoegen.bind(null, m.id, it.id)} className="knop klein">Toevoegen</button></div>
              </details>
            </section>
          )
        })}

        {chair && (
          <section className="kaart tint">
            <h2>Extra agendapunt voor dit overleg</h2>
            <p className="zacht klein">De vaste agendapunten en eigenaren pas je aan bij Instellingen.</p>
            <div className="velden twee">
              <div className="veld"><label htmlFor="nieuw-titel">Agendapunt</label><input id="nieuw-titel" name="nieuw-titel" type="text" maxLength={200} /></div>
              <div className="veld"><label htmlFor="nieuw-eigenaar">Eigenaar</label><input id="nieuw-eigenaar" name="nieuw-eigenaar" type="text" maxLength={100} /></div>
            </div>
            <div><button formAction={puntToevoegen.bind(null, m.id)} className="knop licht klein">Toevoegen</button></div>
          </section>
        )}

        <div className="balk">
          {current < 0 ? (
            <button formAction={naarPunt.bind(null, m.id, agenda[0]?.id ?? null)} className="knop" disabled={!agenda.length}>Start het overleg</button>
          ) : (
            <>
              <button formAction={naarPunt.bind(null, m.id, prev?.id ?? null)} className="knop licht" disabled={!prev}>Vorige punt</button>
              <button formAction={naarPunt.bind(null, m.id, next?.id ?? null)} className="knop licht" disabled={!next}>Volgende punt</button>
            </>
          )}
          <button className="knop licht">Bewaren</button>
          <button formAction={afronden.bind(null, m.id)} className="knop">Afronden</button>
        </div>
      </form>
    </main>
  )
}
