import Link from 'next/link'
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { answers, db, slots, talks, weekchecks } from '@/db'
import { Antwoord } from '@/components/Antwoord'
import { employeesVisibleTo } from '@/lib/access'
import { requireStaff } from '@/lib/auth'
import { decrypt } from '@/lib/crypto'
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
  const helpAnswers = help.length
    ? await db.select().from(answers).where(and(inArray(answers.weekcheckId, help.map((h) => h.id)), eq(answers.shared, true)))
    : []

  const open = ids.length
    ? await db
        .select({ talk: talks, slot: slots })
        .from(talks)
        .leftJoin(slots, eq(slots.talkId, talks.id))
        .where(and(inArray(talks.employeeId, ids), ne(talks.status, 'gevoerd')))
        .orderBy(asc(slots.startsAt))
    : []
  const planned = open.filter((r) => r.slot)
  const unplanned = open.filter((r) => !r.slot)

  const now = isoWeek(new Date())
  const recent = ids.length
    ? await db.select().from(weekchecks).where(inArray(weekchecks.userId, ids))
    : []
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
              <div key={h.id} className="stapel">
                <strong>{name(h.userId)}, week {h.week}</strong>
                {helpAnswers.filter((a) => a.weekcheckId === h.id).map((a) => (
                  <div key={a.id}>
                    <span className="zacht klein">{a.questionText}</span>
                    <br />
                    <Antwoord a={{ answerType: a.answerType, value: decrypt(a.valueEnc), smiley: a.smiley, note: decrypt(a.noteEnc) }} />
                  </div>
                ))}
                <form action={hulpOpgepakt.bind(null, h.id)}>
                  <button className="knop klein">Ik heb het opgepakt</button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

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
