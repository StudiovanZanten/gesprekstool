import { and, asc, eq, gt } from 'drizzle-orm'
import { db, employeeTypes, organisations, slots, talkWeeks, talks, users } from '@/db'
import { requireStaff } from '@/lib/auth'
import { fmtDate, fmtTime, isoWeek, TZ, weekLabel } from '@/lib/dates'
import { stelWekenIn, verwijderMoment, zetMomentenOpen } from './actions'

export default async function Planning({ searchParams }: { searchParams: Promise<{ melding?: string; n?: string }> }) {
  const sp = await searchParams
  const me = await requireStaff()
  const isAdmin = me.role === 'beheerder'
  const [org] = await db.select().from(organisations).where(eq(organisations.id, me.orgId))
  const { year } = isoWeek(new Date())
  const types = (await db.select().from(employeeTypes).where(eq(employeeTypes.orgId, me.orgId)).orderBy(asc(employeeTypes.position))).filter((t) => t.rhythm === 'weken')
  const weeks = await db.select().from(talkWeeks).where(eq(talkWeeks.orgId, me.orgId)).orderBy(asc(talkWeeks.year), asc(talkWeeks.week))
  const mine = await db
    .select({ slot: slots, talk: talks, emp: users })
    .from(slots)
    .leftJoin(talks, eq(talks.id, slots.talkId))
    .leftJoin(users, eq(users.id, talks.employeeId))
    .where(and(eq(slots.hostId, me.id), gt(slots.startsAt, new Date())))
    .orderBy(asc(slots.startsAt))
  const days = new Map<string, typeof mine>()
  for (const r of mine) {
    const k = r.slot.startsAt.toLocaleDateString('sv-SE', { timeZone: TZ })
    days.set(k, [...(days.get(k) ?? []), r])
  }
  const now = isoWeek(new Date())
  const upcoming = weeks.filter((w) => w.year > now.year || (w.year === now.year && w.week >= now.week))
  const upcomingUnique = [...new Map(upcoming.map((w) => [`${w.year}-${w.week}`, w])).values()]

  return (
    <main>
      <h1>Planning</h1>
      {sp.melding === 'bewaard' && <div className="melding goed">Gespreksweken bewaard.</div>}
      {sp.melding === 'bewaard-deels' && <div className="melding">Bewaard. Een week waarvoor al gesprekken klaarstaan, is blijven staan.</div>}
      {sp.melding === 'open' && <div className="melding goed">{sp.n} momenten opengezet.</div>}
      {sp.melding === 'fout' && <div className="melding fout">Kies een datum en een begin en eindtijd met genoeg ruimte voor minstens één gesprek.</div>}

      {isAdmin && (
        <section className="kaart">
          <h2>Vaste gespreksweken</h2>
          <p className="zacht klein">Vul de weeknummers in, met komma&apos;s ertussen. Drie weken voor zo&apos;n week krijgen medewerkers een uitnodiging om een moment te kiezen.</p>
          {types.map((t) => (
            <div key={t.id} className="stapel">
              <strong>{t.name}</strong>
              {[year, year + 1].map((y) => (
                <form key={y} action={stelWekenIn.bind(null, t.id, y)} className="rij">
                  <label htmlFor={`w-${t.id}-${y}`} style={{ margin: 0, minWidth: 50 }}>{y}</label>
                  <input
                    id={`w-${t.id}-${y}`}
                    name="weken"
                    type="text"
                    style={{ maxWidth: 260 }}
                    placeholder="bijvoorbeeld 11, 24, 37, 50"
                    defaultValue={weeks.filter((w) => w.typeId === t.id && w.year === y).map((w) => w.week).join(', ')}
                  />
                  <button className="knop licht klein">Bewaren</button>
                </form>
              ))}
            </div>
          ))}
        </section>
      )}

      <section className="kaart">
        <h2>Momenten openzetten</h2>
        <p className="zacht klein">
          Kies een dag en de tijd waarop je kunt. De tool maakt er blokken van {org.talkMinutes} minuten van.
          {isAdmin && upcomingUnique.length > 0 && ` Komende gespreksweken: ${upcomingUnique.slice(0, 3).map((w) => weekLabel(w.year, w.week)).join(', ')}.`}
        </p>
        <form action={zetMomentenOpen} className="velden">
          <div className="veld"><label htmlFor="datum">Datum</label><input id="datum" name="datum" type="date" required /></div>
          <div className="veld"><label htmlFor="van">Van</label><input id="van" name="van" type="time" required defaultValue="10:00" /></div>
          <div className="veld"><label htmlFor="tot">Tot</label><input id="tot" name="tot" type="time" required defaultValue="14:00" /></div>
          <div className="veld" style={{ justifyContent: 'flex-end' }}><button className="knop">Openzetten</button></div>
        </form>
      </section>

      <section className="kaart">
        <h2>Mijn momenten</h2>
        {days.size ? (
          [...days.entries()].map(([day, list]) => (
            <div key={day} className="stapel">
              <strong>{fmtDate(day)}</strong>
              <div className="lijst">
                {list.map(({ slot, emp }) => (
                  <div key={slot.id} className="rij tussen">
                    <span>{fmtTime(slot.startsAt)} tot {fmtTime(slot.endsAt)}</span>
                    {emp ? (
                      <span className="pil goed">{emp.name}</span>
                    ) : (
                      <form action={verwijderMoment.bind(null, slot.id)} className="rij">
                        <span className="pil">Vrij</span>
                        <button className="knop licht klein">Weghalen</button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="zacht">Je hebt nog geen momenten openstaan.</p>
        )}
      </section>
    </main>
  )
}
