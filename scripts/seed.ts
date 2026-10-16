// Zet de eerste organisatie klaar met vragenlijsten, types en één beheerder.
// Gebruik: SEED_ADMIN_NAME="Naam" SEED_ADMIN_EMAIL="mail@voorbeeld.nl" npm run db:seed
// Met --demo komen er ook verzonnen testmedewerkers bij (alleen voor op je laptop).
import 'dotenv/config'
import { and, asc, eq, notLike } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as s from '../src/db/schema'
import {
  INTERESSE,
  oproep,
  SECTIE_PER_ONDERWERP,
  stage,
  vast,
  WEEK_KEUZES,
  weekcheck,
  type SeedQuestion,
} from '../src/data/brownies-vragen'

const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })
const db = drizzle(sql, { schema: s })

const ORG_NAME = process.env.SEED_ORG_NAME || 'Brownies&downieS Uden'

function row(questionnaireId: string, kind: 'gesprek' | 'week', q: SeedQuestion, position: number) {
  return {
    questionnaireId,
    position,
    text: q.text,
    answerType: q.type,
    topic: q.topic,
    section: kind === 'gesprek' ? (q.section ?? SECTIE_PER_ONDERWERP[q.topic] ?? null) : null,
    options: q.options ? JSON.stringify(q.options) : null,
    smileyVisibleFrom: q.visible ? new Date() : null,
    allowNote: q.type === 'smiley',
    showPrevAgreements: !!q.prev,
    helpSignal: !!q.help,
    isGoal: !!q.goal,
  }
}

async function list(orgId: string, name: string, kind: 'gesprek' | 'week', qs: SeedQuestion[]) {
  const [ql] = await db.insert(s.questionnaires).values({ orgId, name, kind }).returning()
  await db.insert(s.questions).values(qs.map((q, i) => row(ql.id, kind, q, i + 1)))
  return ql.id
}

// Samen Groeien 2.0: zet bestaande vragenlijsten om naar de nieuwe opzet. Doet niets als dat al gebeurd is.
// Oude antwoorden blijven staan, want die bewaren hun eigen vraagtekst.
async function upgrade(orgId: string) {
  // Afspraken die al gelukt waren krijgen de voortgang Gelukt.
  await db.update(s.agreements).set({ status: 'gelukt' }).where(and(eq(s.agreements.done, true), eq(s.agreements.status, 'nog_niet')))
  const [org] = await db.select().from(s.organisations).where(eq(s.organisations.id, orgId))
  if (org.weeklyQuestionnaireId) {
    const qs = await db.select().from(s.questions).where(eq(s.questions.questionnaireId, org.weeklyQuestionnaireId))
    if (!qs.some((q) => q.answerType === 'keuze')) {
      const set = async (text: string, data: Partial<typeof s.questions.$inferInsert>) => {
        const q = qs.find((x) => x.text === text)
        if (q) await db.update(s.questions).set(data).where(eq(s.questions.id, q.id))
      }
      await set('Hoe was jouw werkweek?', { text: weekcheck[0].text, helpSignal: true, smileyVisibleFrom: new Date(), position: 1 })
      await set('Noem 1 succesje van deze week.', { text: weekcheck[1].text, position: 2 })
      await set('Wat vond je lastig deze week? Heb je ergens hulp bij nodig?', { active: false, helpSignal: false, position: 99 })
      await set('Geef jezelf een tip voor deze week.', { text: weekcheck[3].text, position: 4 })
      await db.insert(s.questions).values(row(org.weeklyQuestionnaireId, 'week', { ...weekcheck[2], options: WEEK_KEUZES }, 3))
      console.log('Weekcheck omgezet naar de nieuwe vier vragen.')
    }
  }
  const types = await db.select().from(s.employeeTypes).where(eq(s.employeeTypes.orgId, orgId))
  for (const t of types) {
    if (!t.questionnaireId) continue
    let qs = await db.select().from(s.questions).where(eq(s.questions.questionnaireId, t.questionnaireId)).orderBy(asc(s.questions.position))
    if (!qs.length || qs.some((q) => q.section)) continue
    for (const q of qs) {
      const section = SECTIE_PER_ONDERWERP[q.topic ?? '']
      if (section) await db.update(s.questions).set({ section }).where(eq(s.questions.id, q.id))
    }
    const samen = qs.find((q) => q.topic === 'Samenwerking')
    if (samen && !qs.some((q) => q.text === INTERESSE.text)) {
      await db.insert(s.questions).values(row(t.questionnaireId, 'gesprek', INTERESSE, samen.position))
    }
    // Nummer opnieuw: eerst onderdeel A, dan B, dan C. Vragen zonder onderdeel achteraan.
    qs = await db.select().from(s.questions).where(eq(s.questions.questionnaireId, t.questionnaireId))
    const rank = (x: string | null) => (x ? 'ABC'.indexOf(x) : 3)
    qs.sort((a, b) => rank(a.section) - rank(b.section) || a.position - b.position || (a.text === INTERESSE.text ? 1 : -1))
    for (const [i, q] of qs.entries()) await db.update(s.questions).set({ position: i + 1 }).where(eq(s.questions.id, q.id))
    console.log(`Vragenlijst ${t.name} verdeeld over onderdeel A, B en C.`)
  }
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
    await upgrade(existing[0].id)
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
