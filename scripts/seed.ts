// Zet de eerste organisatie klaar met vragenlijsten, types en één beheerder.
// Gebruik: SEED_ADMIN_NAME="Naam" SEED_ADMIN_EMAIL="mail@voorbeeld.nl" npm run db:seed
// Met --demo komen er ook verzonnen testmedewerkers bij (alleen voor op je laptop).
import 'dotenv/config'
import { and, eq, notLike } from 'drizzle-orm'
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

// Laat in het bouwlogboek zien welk adres is gebruikt, zonder het hele adres te tonen.
function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  return `${name.slice(0, 2)}***@${domain}`
}

async function main() {
  const adminName = process.env.SEED_ADMIN_NAME
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim()
  if (!adminName || !adminEmail) {
    console.log('Geen SEED_ADMIN_NAME en SEED_ADMIN_EMAIL ingevuld, er is niets klaargezet.')
    return
  }

  const shown = maskEmail(adminEmail)
  const existing = await db.select().from(s.organisations).where(eq(s.organisations.name, ORG_NAME))
  if (existing.length) {
    // Een beheerder zonder geldig mailadres (bijvoorbeeld iets verkeerds ingevuld bij SEED_ADMIN_EMAIL)
    // kan nooit inloggen. Die halen we weg.
    const removed = await db
      .delete(s.users)
      .where(and(eq(s.users.orgId, existing[0].id), eq(s.users.role, 'beheerder'), notLike(s.users.email, '%@%')))
      .returning({ id: s.users.id })
    if (removed.length) console.log(`${removed.length} beheerder(s) zonder geldig mailadres verwijderd.`)
    // Bestaat de organisatie al maar is de beheerder nog niet bekend (bijvoorbeeld een ander mailadres ingevuld),
    // dan komt die er alsnog bij. Bestaande gebruikers blijven zoals ze zijn.
    const [known] = await db.select().from(s.users).where(eq(s.users.email, adminEmail))
    if (known) {
      console.log(`${ORG_NAME} bestaat al, beheerder ${shown} is bekend. Er is niets veranderd.`)
      return
    }
    await db.insert(s.users).values({ orgId: existing[0].id, name: adminName, email: adminEmail, role: 'beheerder' })
    console.log(`${ORG_NAME} bestaat al, beheerder ${shown} is toegevoegd.`)
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
  console.log(`Klaar: ${ORG_NAME} met beheerder ${adminName} (${shown}).`)

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
