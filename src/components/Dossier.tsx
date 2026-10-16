import Link from 'next/link'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { answers, db, users, weekchecks } from '@/db'
import { fmtDateLong, weekLabel } from '@/lib/dates'

// Alle weekchecks van een medewerker die gedeeld zijn of waarin om hulp is gevraagd, met wat ermee gedaan is.
export async function Dossier({ employeeId }: { employeeId: string }) {
  const checks = await db.select().from(weekchecks).where(eq(weekchecks.userId, employeeId)).orderBy(desc(weekchecks.year), desc(weekchecks.week))
  const sharedIds = checks.length
    ? new Set(
        (await db.select({ id: answers.weekcheckId }).from(answers).where(and(inArray(answers.weekcheckId, checks.map((c) => c.id)), eq(answers.shared, true)))).map((a) => a.id),
      )
    : new Set<string | null>()
  const rows = checks.filter((c) => c.helpRequested || sharedIds.has(c.id))
  const staffIds = [...new Set(rows.flatMap((c) => [c.readBy, c.helpHandledBy]).filter((x): x is string => !!x))]
  const staff = staffIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, staffIds)) : []
  const who = (id: string | null) => staff.find((s) => s.id === id)?.name.split(' ')[0] ?? ''

  return (
    <section className="kaart">
      <h2>Dossier weekchecks</h2>
      {rows.length ? (
        <div className="lijst">
          {rows.map((c) => (
            <div key={c.id} className="rij tussen">
              <span className="stapel" style={{ gap: 6 }}>
                <strong>{weekLabel(c.year, c.week)}</strong>
                <span className="rij" style={{ gap: 6 }}>
                  {c.helpRequested && !c.helpHandledAt && <span className="pil rood">Vraagt om hulp</span>}
                  {c.helpHandledAt && <span className="pil goed">Hulp opgepakt{c.helpHandledBy ? ` door ${who(c.helpHandledBy)}` : ''} op {fmtDateLong(c.helpHandledAt)}</span>}
                  {c.readAt ? (
                    <span className="pil">Gelezen{c.readBy ? ` door ${who(c.readBy)}` : ''} op {fmtDateLong(c.readAt)}</span>
                  ) : (
                    <span className="pil let-op">Nieuw</span>
                  )}
                </span>
              </span>
              <Link href={`/beheer/weekcheck/${c.id}`} className="knop licht klein">Bekijken</Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="zacht">Nog geen gedeelde weekchecks.</p>
      )}
    </section>
  )
}
