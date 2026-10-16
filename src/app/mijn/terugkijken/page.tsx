import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'
import { db, slots, talks } from '@/db'
import { Antwoord } from '@/components/Antwoord'
import { requireUser } from '@/lib/auth'
import { decrypt } from '@/lib/crypto'
import { fmtDateLong } from '@/lib/dates'
import { agreementsOf, talkAnswers, weekchecksSince } from '@/lib/talks'

export default async function Terugkijken() {
  const user = await requireUser()
  const held = await db
    .select({ talk: talks, slot: slots })
    .from(talks)
    .leftJoin(slots, eq(slots.talkId, talks.id))
    .where(and(eq(talks.employeeId, user.id), eq(talks.status, 'gevoerd')))
    .orderBy(desc(talks.heldAt))
  const checks = await weekchecksSince(user.id, null)
  return (
    <main className="smal">
      <h1>Terugkijken</h1>
      <p className="zacht">Al je antwoorden, ook wat je niet gedeeld hebt. Alleen jij ziet dit.</p>
      <section className="stapel">
        <h2>Mijn gesprekken</h2>
        {held.length === 0 && <p className="zacht">Je hebt nog geen gesprekken gehad.</p>}
        {await Promise.all(
          held.map(async ({ talk, slot }) => {
            const ag = await agreementsOf(talk.id)
            const ans = await talkAnswers(talk.id)
            return (
              <details key={talk.id} className="kaart">
                <summary>
                  <strong>{fmtDateLong(slot?.startsAt ?? talk.heldAt)}</strong>, {talk.label}
                </summary>
                <p><Link href={`/verslag/${talk.id}`}>Het hele verslag lezen</Link></p>
                {talk.goodEnc && (<><h3>Wat gaat goed</h3><p>{decrypt(talk.goodEnc)}</p></>)}
                {talk.attentionEnc && (<><h3>Wat vraagt aandacht</h3><p>{decrypt(talk.attentionEnc)}</p></>)}
                <h3>Afspraken</h3>
                {ag.length ? (
                  <ul>{ag.map((a) => <li key={a.id}>{a.text}{a.reviewDate ? `, terugkijken op ${fmtDateLong(a.reviewDate)}` : ''}</li>)}</ul>
                ) : (
                  <p className="zacht">Geen afspraken.</p>
                )}
                <h3>Mijn voorbereiding</h3>
                <div className="lijst">
                  {ans.map((a) => (
                    <div key={a.id}>
                      <span className="zacht klein">{a.questionText}{a.shared ? '' : ' (niet gedeeld)'}</span>
                      <br />
                      <Antwoord a={a} />
                    </div>
                  ))}
                </div>
              </details>
            )
          }),
        )}
      </section>
      <section className="stapel">
        <h2>Mijn weekchecks</h2>
        {checks.length === 0 && <p className="zacht">Nog geen weekchecks.</p>}
        {checks.map((c) => (
          <details key={c.id} className="kaart">
            <summary><strong>Week {c.week}, {c.year}</strong></summary>
            <div className="lijst">
              {c.answers.map((a) => (
                <div key={a.id}>
                  <span className="zacht klein">{a.questionText}{a.shared ? ' (gedeeld)' : ''}</span>
                  <br />
                  <Antwoord a={a} />
                </div>
              ))}
            </div>
          </details>
        ))}
      </section>
    </main>
  )
}
