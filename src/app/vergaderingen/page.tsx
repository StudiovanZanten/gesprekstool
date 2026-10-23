import Link from 'next/link'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { db, meetings } from '@/db'
import { ActieRegel, OnderwerpRegel, PRIVACY_TEKST } from '@/components/Overleg'
import { requireUser } from '@/lib/auth'
import { fmtDate, isoWeek } from '@/lib/dates'
import { agendaOf, ensureNextMeeting, isChair, openActionsOfOrg, teamOf, topicsOf } from '@/lib/meetings'
import { actieKlaar, mijnMailadres, onderwerpInbrengen, onderwerpWeg, verzoekBeslissen } from './actions'

const MELDINGEN: Record<string, [string, string]> = {
  ingebracht: ['goed', 'Je onderwerp is ingebracht.'],
  leeg: ['fout', 'Vul eerst in waar je het over wilt hebben.'],
  mail: ['goed', 'Je mailadres is bewaard.'],
  'mail-fout': ['fout', 'Dat mailadres klopt niet. Kijk het nog even na.'],
}

// Overzicht van het overleg: de agenda van de volgende keer, onderwerpen inbrengen, actiepunten en het archief.
export default async function Vergaderingen({ searchParams }: { searchParams: Promise<{ melding?: string }> }) {
  const sp = await searchParams
  const me = await requireUser()
  const next = await ensureNextMeeting(me.orgId)
  const agenda = await agendaOf(next.id)
  const topics = await topicsOf(next.id)
  const team = await teamOf(me.orgId)
  const names = new Map(team.map((u) => [u.id, u.name]))
  const open = await openActionsOfOrg(me.orgId)
  const mine = open.filter((a) => a.ownerId === me.id)
  const others = open.filter((a) => a.ownerId !== me.id)
  const earlier = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.orgId, me.orgId), isNotNull(meetings.finishedAt)))
    .orderBy(desc(meetings.date))
    .limit(60)
  const chair = isChair(me)
  const melding = sp.melding ? MELDINGEN[sp.melding] : undefined
  const rondvraag = agenda.find((i) => /rondvraag/i.test(i.title))
  const live = !!next.currentItemId

  // Een verzoek ziet alleen de voorzitter en wie het inbracht. Afgewezen onderwerpen ziet alleen wie het inbracht.
  const visible = (t: (typeof topics)[number]) => t.status === 'akkoord' || t.addedBy === me.id || (chair && t.status === 'verzoek')

  return (
    <main>
      <h1>Overleg</h1>
      {melding && <div className={`melding ${melding[0]}`}>{melding[1]}</div>}

      <section className="kaart">
        <div className="rij tussen">
          <div>
            <h2>{live ? 'Het overleg is bezig' : 'Volgende overleg'}</h2>
            <p className="zacht">{fmtDate(next.date)} om {next.time} uur</p>
          </div>
          <Link href={`/vergaderingen/${next.id}`} className="knop">
            {live ? 'Meekijken' : chair ? 'Open het overleg' : 'Bekijk het overleg'}
          </Link>
        </div>
        <ol className="agenda">
          {agenda.map((it) => (
            <li key={it.id} className={it.id === next.currentItemId ? 'nu' : undefined}>
              <div className="rij" style={{ gap: 8 }}>
                <strong>{it.title}</strong>
                {it.owner && <span className="pil">{it.owner}</span>}
                {it.id === next.currentItemId && <span className="pil goed">Nu aan de beurt</span>}
              </div>
              {topics.filter((t) => t.itemId === it.id && visible(t)).map((t) => (
                <div key={t.id} className="onderwerp">
                  <OnderwerpRegel t={t} names={names} />
                  <div className="rij" style={{ gap: 6 }}>
                    {chair && t.status === 'verzoek' && (
                      <>
                        <form action={verzoekBeslissen.bind(null, t.id, 'akkoord')}>
                          <input type="hidden" name="terug" value="overzicht" />
                          <button className="knop klein">Op de agenda</button>
                        </form>
                        <form action={verzoekBeslissen.bind(null, t.id, 'niet')}>
                          <input type="hidden" name="terug" value="overzicht" />
                          <button className="knop licht klein">Niet deze keer</button>
                        </form>
                      </>
                    )}
                    {t.addedBy === me.id && t.status !== 'akkoord' && (
                      <form action={onderwerpWeg.bind(null, t.id)}>
                        <input type="hidden" name="terug" value="overzicht" />
                        <button className="knop licht klein">Weghalen</button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </li>
          ))}
        </ol>
      </section>

      <form action={onderwerpInbrengen.bind(null, next.id)} className="kaart tint">
        <h2>Onderwerp inbrengen</h2>
        <p className="zacht klein">
          {chair ? 'Jouw onderwerp komt meteen op de agenda.' : 'Je onderwerp komt als verzoek bij Reno, die het op de agenda zet.'}
        </p>
        <input type="hidden" name="terug" value="overzicht" />
        <div className="veld">
          <label htmlFor="agendapunt">Bij welk agendapunt?</label>
          <select id="agendapunt" name="agendapunt" defaultValue={rondvraag?.id ?? agenda[0]?.id}>
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

      <section className="kaart" id="acties">
        <h2>Actiepunten</h2>
        <p className="zacht klein">Iedereen mag een actiepunt afvinken. Wat niet klaar is, komt vanzelf terug bij het volgende overleg.</p>
        {open.length ? (
          <div className="lijst">
            {[...mine, ...others].map((a) => (
              <div key={a.id} className="rij tussen">
                <ActieRegel a={a} names={names} me={me.id} />
                <form action={actieKlaar.bind(null, a.id, true)}>
                  <button className="knop klein">Klaar</button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <p className="zacht">Er staan geen open actiepunten.</p>
        )}
      </section>

      <form action={mijnMailadres} className="kaart" id="mail">
        <h2>Mijn mailadres voor actiepunten</h2>
        <p className="zacht klein">Na elk overleg krijg je hier een mail met alleen jouw eigen actiepunten. Laat je het leeg, dan gebruiken we {me.email ?? 'je gewone mailadres'}.</p>
        <div className="rij">
          <input name="mail" type="email" aria-label="Mailadres voor actiepunten" defaultValue={me.meetingEmail ?? ''} placeholder={me.email ?? ''} style={{ maxWidth: 360 }} />
          <button className="knop">Bewaren</button>
        </div>
      </form>

      <section className="kaart">
        <h2>Archief</h2>
        {earlier.length ? (
          <div className="lijst">
            {earlier.map((m) => (
              <Link key={m.id} href={`/vergaderingen/${m.id}`}>
                Week {isoWeek(new Date(m.date + 'T12:00:00Z')).week}, {fmtDate(m.date)}
              </Link>
            ))}
          </div>
        ) : (
          <p className="zacht">Er zijn nog geen afgeronde vergaderingen.</p>
        )}
      </section>
    </main>
  )
}
