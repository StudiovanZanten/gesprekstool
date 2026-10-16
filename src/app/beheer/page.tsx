import Link from 'next/link'
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { db, slots, talkWeeks, talks, weekchecks } from '@/db'
import { employeesVisibleTo } from '@/lib/access'
import { requireStaff } from '@/lib/auth'
import { fmtDate, fmtTime, isoWeek } from '@/lib/dates'
import { ensureTalks } from '@/lib/talks'
import { hulpOpgepakt } from './actions'

export default async function Beheer() {
  const me = await requireStaff()
  await ensureTalks(me.orgId)
  const emps = (await employeesVisibleTo(me)).filter((e) => e.active)
  const ids = emps.map((e) => e.id)
  const name = (id: string) => emps.find((e) => e.id === id)?.name ?? ''

  const help = ids.length
    ? await db
        .select()
        .from(weekchecks)
        .where(and(inArray(weekchecks.userId, ids), eq(weekchecks.helpRequested, true), isNull(weekchecks.helpHandledAt)))
        .orderBy(desc(weekchecks.createdAt))
    : []

  const open = ids.length
    ? await db
        .select({ talk: talks, slot: slots, tw: talkWeeks })
        .from(talks)
        .leftJoin(slots, eq(slots.talkId, talks.id))
        .leftJoin(talkWeeks, eq(talkWeeks.id, talks.talkWeekId))
        .where(and(inArray(talks.employeeId, ids), ne(talks.status, 'gevoerd')))
        .orderBy(asc(slots.startsAt))
    : []
  const planned = open.filter((r) => r.slot)
  const order = (r: (typeof open)[number]) => (r.tw ? r.tw.year * 100 + r.tw.week : 999999)
  // Per medewerker alleen het eerstvolgende gesprek waarvoor nog geen moment gekozen is.
  const unplanned = [
    ...new Map(
      open
        .filter((r) => !r.slot)
        .sort((a, b) => order(a) - order(b))
        .reverse()
        .map((r) => [r.talk.employeeId, r]),
    ).values(),
  ].reverse()

  const now = isoWeek(new Date())
  const recent = ids.length
    ? await db.select().from(weekchecks).where(inArray(weekchecks.userId, ids))
    : []
  const thisWeek = recent
    .filter((c) => c.year === now.year && c.week === now.week)
    .sort((a, b) => name(a.userId).localeCompare(name(b.userId)))
  const threeWeeksAgo = Date.now() - 21 * 86400000
  const missing = emps.filter((e) => {
    if (e.createdAt.getTime() > threeWeeksAgo) return false
    const last = recent.filter((c) => c.userId === e.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    return !last || last.createdAt.getTime() < threeWeeksAgo
  })

  return (
    <main>
      <h1>Hoi {me.name.split(' ')[0]}</h1>
      <p className="zacht">Week {now.week}</p>

      {help.length > 0 && (
        <section className="kaart tint">
          <h2>Vraagt om hulp</h2>
          <div className="lijst">
            {help.map((h) => (
              <div key={h.id} className="rij tussen">
                <span>
                  <strong>{name(h.userId)}</strong>
                  <br />
                  <span className="zacht klein">Weekcheck week {h.week}</span>
                </span>
                <span className="rij" style={{ gap: 8 }}>
                  <Link href={`/beheer/weekcheck/${h.id}`} className="knop klein">Bekijken</Link>
                  <form action={hulpOpgepakt.bind(null, h.id, false)}>
                    <button className="knop licht klein">Opgepakt</button>
                  </form>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="kaart">
        <h2>Weekcheck deze week</h2>
        <p className="zacht klein">{thisWeek.length} van {emps.filter((e) => e.role === 'medewerker').length} medewerkers hebben hem ingevuld.</p>
        {thisWeek.length > 0 && (
          <div className="rij" style={{ gap: 8 }}>
            {thisWeek.map((c) => (
              <Link key={c.id} href={`/beheer/weekcheck/${c.id}`} className={`knop klein ${c.readAt ? 'licht' : ''}`}>
                {name(c.userId)}{c.readAt ? '' : ', nieuw'}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="kaart">
        <h2>Komende gesprekken</h2>
        {planned.length ? (
          <div className="lijst">
            {planned.map(({ talk, slot }) => (
              <div key={talk.id} className="rij tussen">
                <span>
                  <strong>{name(talk.employeeId)}</strong>
                  <br />
                  <span className="zacht klein">{fmtDate(slot!.startsAt)} om {fmtTime(slot!.startsAt)}</span>
                </span>
                <span className="rij">
                  {talk.status === 'gedeeld' ? <span className="pil goed">Voorbereiding gedeeld</span> : <span className="pil let-op">Nog niet gedeeld</span>}
                  <Link href={`/beheer/gesprek/${talk.id}`} className="knop klein">Overzicht</Link>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="zacht">Er zijn nog geen gesprekken ingepland.</p>
        )}
      </section>

      {unplanned.length > 0 && (
        <section className="kaart">
          <h2>Nog geen moment gekozen</h2>
          <div className="lijst">
            {unplanned.map(({ talk }) => (
              <div key={talk.id} className="rij tussen">
                <span><strong>{name(talk.employeeId)}</strong><br /><span className="zacht klein">{talk.label}</span></span>
                <Link href={`/beheer/gesprek/${talk.id}`} className="knop licht klein">Bekijken</Link>
              </div>
            ))}
          </div>
          <p className="zacht klein">Staan er genoeg momenten open? Kijk bij <Link href="/beheer/planning">Planning</Link>.</p>
        </section>
      )}

      {missing.length > 0 && (
        <section className="kaart">
          <h2>Al drie weken geen weekcheck</h2>
          <p>{missing.map((e) => e.name).join(', ')}</p>
          <p className="zacht klein">Misschien even vragen hoe het gaat.</p>
        </section>
      )}
    </main>
  )
}
