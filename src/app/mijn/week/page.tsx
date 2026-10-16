import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { db, organisations, weekchecks } from '@/db'
import { Vragen } from '@/components/Vragen'
import { optionsOf } from '@/lib/questions'
import { isIntern } from '@/lib/access'
import { requireUser } from '@/lib/auth'
import { isoWeek } from '@/lib/dates'
import { activeQuestions, weekchecksSince } from '@/lib/talks'
import { bewaarWeekcheck } from './actions'

export default async function Week({ searchParams }: { searchParams: Promise<{ klaar?: string }> }) {
  const { klaar } = await searchParams
  const user = await requireUser()
  const [org] = await db.select().from(organisations).where(eq(organisations.id, user.orgId))
  const qs = await activeQuestions(org.weeklyQuestionnaireId)
  const { year, week } = isoWeek(new Date())
  const [check] = await db
    .select()
    .from(weekchecks)
    .where(and(eq(weekchecks.userId, user.id), eq(weekchecks.year, year), eq(weekchecks.week, week)))
  const prev = check ? (await weekchecksSince(user.id, null)).find((c) => c.id === check.id) : null
  const hulpNaam = (await isIntern(user)) ? 'je stagebegeleider' : 'je leidinggevende'
  if (klaar) {
    return (
      <main className="smal">
        <div className="kaart tint">
          <h1>Dank je wel!</h1>
          <p>Je weekcheck is bewaard. Wat je gedeeld hebt, kan {hulpNaam} lezen. Je kunt het deze week nog aanpassen.</p>
          <div className="rij">
            <Link href="/mijn" className="knop">Terug naar start</Link>
            <Link href="/mijn/week" className="knop licht">Nog iets aanpassen</Link>
          </div>
        </div>
      </main>
    )
  }
  return (
    <main className="smal">
      <h1>Mijn week</h1>
      <p className="zacht">Week {week}. Op het eind kies je of je de weekcheck deelt met {hulpNaam}.</p>
      <Vragen
        action={bewaarWeekcheck}
        klaarTekst="Klaar"
        hulpNaam={hulpNaam}
        hulpAan={check?.helpRequested}
        deelAan={check?.shared ?? true}
        vragen={qs.map((q) => {
          const a = prev?.answers.find((x) => x.questionId === q.id)
          return {
            id: q.id,
            text: q.text,
            answerType: q.answerType,
            section: q.section,
            options: optionsOf(q),
            smileyVisible: !!q.smileyVisibleFrom,
            allowNote: q.allowNote,
            helpSignal: q.helpSignal,
            value: a?.value ?? '',
            smiley: a?.smiley ?? null,
            note: a?.note ?? '',
          }
        })}
      />
    </main>
  )
}
