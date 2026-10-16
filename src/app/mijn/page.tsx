import Link from 'next/link'
import { and, eq, isNull } from 'drizzle-orm'
import { db, talks, weekchecks } from '@/db'
import { IconBack, IconTalk, IconWeek } from '@/components/icons'
import { requireUser } from '@/lib/auth'
import { isoWeek } from '@/lib/dates'
import { currentTalk, slotForTalk } from '@/lib/talks'

export default async function Mijn() {
  const user = await requireUser()
  const { year, week } = isoWeek(new Date())
  const [check] = await db
    .select()
    .from(weekchecks)
    .where(and(eq(weekchecks.userId, user.id), eq(weekchecks.year, year), eq(weekchecks.week, week)))
  const talk = await currentTalk(user)
  const slot = talk ? await slotForTalk(talk.id) : null
  const toRead = await db
    .select({ id: talks.id })
    .from(talks)
    .where(and(eq(talks.employeeId, user.id), eq(talks.status, 'gevoerd'), isNull(talks.employeeConfirmedAt)))
  const voornaam = user.name.split(' ')[0]
  return (
    <main>
      <h1>Hoi {voornaam}</h1>
      <div className="tegels">
        <Link href="/mijn/week" className="tegel">
          {!check && <span className="stip">Klaar voor jou</span>}
          <span className="icoon"><IconWeek /></span>
          <strong>Mijn week</strong>
          <span className="zacht">{check ? 'Je hebt je weekcheck ingevuld. Goed bezig!' : 'Je weekcheck van deze week. Duurt ongeveer twee minuten.'}</span>
        </Link>
        <Link href="/mijn/gesprek" className="tegel">
          {talk && talk.status !== 'gedeeld' && <span className="stip">{slot ? 'Voorbereiden' : 'Kies een moment'}</span>}
          <span className="icoon"><IconTalk /></span>
          <strong>Mijn gesprek</strong>
          <span className="zacht">{talk ? talk.label : 'Er staat nu geen gesprek klaar.'}</span>
        </Link>
        <Link href={toRead.length === 1 ? `/verslag/${toRead[0].id}` : '/mijn/profiel'} className="tegel">
          {toRead.length > 0 && <span className="stip">Verslag lezen</span>}
          <span className="icoon"><IconBack /></span>
          <strong>Mijn profiel</strong>
          <span className="zacht">Je ontwikkelplan, je doelen en je verslagen.</span>
        </Link>
      </div>
    </main>
  )
}
