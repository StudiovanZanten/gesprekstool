import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db, weekchecks } from '@/db'
import { Antwoord } from '@/components/Antwoord'
import { loadVisibleEmployee, logAccess } from '@/lib/access'
import { requireStaff } from '@/lib/auth'
import { checkAnswers } from '@/lib/talks'
import { weekLabel } from '@/lib/dates'
import { hulpOpgepakt } from '../../actions'

// De gedeelde antwoorden van één weekcheck.
export default async function Weekcheck({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireStaff()
  const [c] = await db.select().from(weekchecks).where(and(eq(weekchecks.id, id), eq(weekchecks.orgId, me.orgId)))
  if (!c) notFound()
  const emp = await loadVisibleEmployee(me, c.userId)
  if (!emp) notFound()
  await logAccess(me, emp.id, `weekcheck week ${c.week}`)
  if (!c.readAt) await db.update(weekchecks).set({ readAt: new Date(), readBy: me.id }).where(eq(weekchecks.id, c.id))
  const shared = await checkAnswers([c.id], true)
  const needsHelp = c.helpRequested && !c.helpHandledAt

  return (
    <main>
      <p className="klein"><Link href="/beheer">Terug naar start</Link></p>
      <h1>{emp.name}</h1>
      <p className="zacht">Weekcheck {weekLabel(c.year, c.week)}</p>
      {needsHelp && (
        <section className="kaart tint">
          <h2>Vraagt om hulp</h2>
          <p>{emp.name.split(' ')[0]} heeft aangegeven graag even met je te praten.</p>
          <form action={hulpOpgepakt.bind(null, c.id, true)}>
            <button className="knop">Ik heb het opgepakt</button>
          </form>
        </section>
      )}
      <section className="kaart">
        <h2>Antwoorden</h2>
        {shared.length ? (
          <div className="lijst">
            {shared.map((a) => (
              <div key={a.id} className="stapel" style={{ gap: 4 }}>
                <span className="zacht klein">{a.questionText}</span>
                <Antwoord a={a} />
                {!a.shared && <span className="zacht klein">Alleen de smiley is zichtbaar. De uitleg is niet gedeeld.</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="zacht">Er zijn geen antwoorden gedeeld.</p>
        )}
      </section>
      <p className="klein"><Link href={`/beheer/medewerkers/${emp.id}`}>Naar het profiel van {emp.name.split(' ')[0]}</Link></p>
    </main>
  )
}
