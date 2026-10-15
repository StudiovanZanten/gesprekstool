// Zet de eerste organisatie klaar met vragenlijsten, types en één beheerder.
// Gebruik: SEED_ADMIN_NAME="Naam" SEED_ADMIN_EMAIL="mail@voorbeeld.nl" npm run db:seed
// Met --demo komen er ook verzonnen testmedewerkers bij (alleen voor op je laptop).
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as s from '../src/db/schema'
import { oproep, stage, vast, weekcheck, type SeedQuestion } from '../src/data/brownies-vragen'

const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })
const db = drizzle(sql, { schema: s })

const ORG_NAME = process.env.SEED_ORG_NAME || 'Brownies&downieS Uden'

async function list(orgId: string, name: string, kind: 'gesprek' | 'week', qs: SeedQuestion[]) {
  const [ql] = await db.insert(s.questionnaires).values({ orgId, name, kind }).returning()
  await db.insert(s.questions).values(
    qs.map((q, i) => ({
      questionnaireId: ql.id,
      position: i + 1,
      text: q.text,
      answerType: q.type,
      topic: q.topic,
      allowNote: q.type === 'smiley',
      showPrevAgreements: !!q.prev,
      helpSignal: !!q.help,
      isGoal: !!q.goal,
    })),
  )
  return ql.id
}

async function main() {
  const adminName = process.env.SEED_ADMIN_NAME
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim()
  if (!adminName || !adminEmail) {
    console.log('Geen SEED_ADMIN_NAME en SEED_ADMIN_EMAIL ingevuld, er is niets klaargezet.')
    return
  }

  const existing = await db.select().from(s.organisations).where(eq(s.organisations.name, ORG_NAME))
  if (existing.length) {
    console.log(`${ORG_NAME} bestaat al, er is niets veranderd.`)
    return
  }
  const [org] = await db.insert(s.organisations).values({ name: ORG_NAME }).returning()
  const weekId = await list(org.id, 'Wekelijkse check', 'week', weekcheck)
  await db.update(s.organisations).set({ weeklyQuestionnaireId: weekId }).where(eq(s.organisations.id, org.id))

  const types = [
    { name: 'Vaste medewerker', rhythm: 'weken' as const, qs: vast },
    { name: 'Oproepkracht', rhythm: 'weken' as const, qs: oproep },
    { name: 'Stagiaire', rhythm: 'stage' as const, qs: stage },
  ]
  const typeIds: Record<string, string> = {}
  for (const [i, t] of types.entries()) {
    const qid = await list(org.id, t.name, 'gesprek', t.qs)
    const [row] = await db
      .insert(s.employeeTypes)
      .values({ orgId: org.id, name: t.name, rhythm: t.rhythm, questionnaireId: qid, position: i })
      .returning()
    typeIds[t.name] = row.id
  }
  const [admin] = await db
    .insert(s.users)
    .values({ orgId: org.id, name: adminName, email: adminEmail, role: 'beheerder' })
    .returning()
  console.log(`Klaar: ${ORG_NAME} met beheerder ${adminName}.`)

  if (process.argv.includes('--demo')) {
    const [beg] = await db
      .insert(s.users)
      .values({ orgId: org.id, name: 'Demo Begeleider', email: 'begeleider@demo.test', role: 'begeleider' })
      .returning()
    await db.insert(s.users).values([
      { orgId: org.id, name: 'Demo Vast', email: 'vast@demo.test', role: 'medewerker', typeId: typeIds['Vaste medewerker'] },
      { orgId: org.id, name: 'Demo Oproep', email: 'oproep@demo.test', role: 'medewerker', typeId: typeIds['Oproepkracht'] },
      { orgId: org.id, name: 'Demo Stagiaire', email: 'stage@demo.test', role: 'medewerker', typeId: typeIds['Stagiaire'], supervisorId: beg.id },
    ])
    console.log('Demo medewerkers toegevoegd (verzonnen, alleen om te testen).', admin.id)
  }
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e)
    await sql.end()
    process.exit(1)
  })
