import 'server-only'
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, ne } from 'drizzle-orm'
import {
  agreements,
  answers,
  db,
  employeeTypes,
  organisations,
  questions,
  slots,
  talkWeeks,
  talks,
  users,
  weekchecks,
  type Talk,
  type User,
} from '@/db'
import { decrypt } from './crypto'
import { bySection } from './questions'
import { addDays, isoWeek, mondayOfWeek, roundLabel, todayStr, TZ } from './dates'

export const INVITE_DAYS_BEFORE = 21

export async function activeQuestions(questionnaireId: string | null) {
  if (!questionnaireId) return []
  const rows = await db
    .select()
    .from(questions)
    .where(and(eq(questions.questionnaireId, questionnaireId), eq(questions.active, true)))
    .orderBy(asc(questions.position))
  return bySection(rows)
}

// Maakt gesprekken aan voor gespreksrondes die binnen drie weken beginnen. Eén gesprek per ronde, ook als die meerdere weken duurt.
// Geeft de nieuwe gesprekken terug, zodat de herinneringstaak een uitnodiging kan sturen.
export async function ensureTalks(orgId: string, onlyUserId?: string): Promise<Talk[]> {
  const today = todayStr()
  const { year } = isoWeek(new Date())
  const weeks = await db
    .select({ tw: talkWeeks, type: employeeTypes })
    .from(talkWeeks)
    .innerJoin(employeeTypes, eq(employeeTypes.id, talkWeeks.typeId))
    .where(and(eq(talkWeeks.orgId, orgId), gte(talkWeeks.year, year - 1), eq(employeeTypes.rhythm, 'weken')))
  const created: Talk[] = []
  for (const { tw } of weeks) {
    const monday = mondayOfWeek(tw.year, tw.week)
    const sunday = addDays(mondayOfWeek(tw.year, tw.weekEnd ?? tw.week), 6)
    if (sunday < today || addDays(monday, -INVITE_DAYS_BEFORE) > today) continue
    const conds = [eq(users.orgId, orgId), eq(users.typeId, tw.typeId), eq(users.active, true), eq(users.role, 'medewerker')]
    if (onlyUserId) conds.push(eq(users.id, onlyUserId))
    const emps = await db.select().from(users).where(and(...conds))
    for (const e of emps) {
      const rows = await db
        .insert(talks)
        .values({ orgId, employeeId: e.id, talkWeekId: tw.id, label: roundLabel(tw.year, tw.week, tw.weekEnd) })
        .onConflictDoNothing()
        .returning()
      created.push(...rows)
    }
  }
  return created
}

export async function talkWeekRange(talk: Talk): Promise<{ from: string; to: string } | null> {
  if (!talk.talkWeekId) return null
  const [tw] = await db.select().from(talkWeeks).where(eq(talkWeeks.id, talk.talkWeekId))
  if (!tw) return null
  const from = mondayOfWeek(tw.year, tw.week)
  return { from, to: addDays(mondayOfWeek(tw.year, tw.weekEnd ?? tw.week), 7) }
}

// Het gesprek waar de medewerker nu mee bezig is: het eerste dat nog niet gevoerd is.
export async function currentTalk(employee: User): Promise<Talk | null> {
  await ensureTalks(employee.orgId, employee.id)
  const [t] = await db
    .select()
    .from(talks)
    .where(and(eq(talks.employeeId, employee.id), ne(talks.status, 'gevoerd')))
    .orderBy(asc(talks.createdAt))
    .limit(1)
  return t ?? null
}

export async function slotForTalk(talkId: string) {
  const [s] = await db.select().from(slots).where(eq(slots.talkId, talkId))
  return s ?? null
}

// Vrije momenten die deze medewerker voor dit gesprek kan kiezen.
export async function freeSlotsFor(employee: User, talk: Talk) {
  const now = new Date()
  const conds = [eq(slots.orgId, employee.orgId), isNull(slots.talkId), gt(slots.startsAt, now)]
  const range = await talkWeekRange(talk)
  if (range) {
    conds.push(gte(slots.startsAt, new Date(range.from + 'T00:00:00Z')))
    conds.push(lt(slots.startsAt, new Date(range.to + 'T00:00:00Z')))
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.orgId, employee.orgId), eq(users.role, 'beheerder'), eq(users.active, true)))
    if (!admins.length) return []
    conds.push(inArray(slots.hostId, admins.map((a) => a.id)))
  } else {
    if (!employee.supervisorId) return []
    conds.push(eq(slots.hostId, employee.supervisorId))
  }
  const free = await db.select().from(slots).where(and(...conds)).orderBy(asc(slots.startsAt))
  const [org] = await db.select().from(organisations).where(eq(organisations.id, employee.orgId))
  if (!org?.onePerDay || !free.length) return free
  // Eén gesprek per dag: een dag waarop de gespreksvoerder al een gesprek heeft, is vol.
  const day = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ })
  const booked = await db
    .select({ hostId: slots.hostId, startsAt: slots.startsAt })
    .from(slots)
    .where(and(eq(slots.orgId, employee.orgId), isNotNull(slots.talkId), ne(slots.talkId, talk.id), gt(slots.startsAt, now)))
  const full = new Set(booked.map((b) => `${b.hostId} ${day(b.startsAt)}`))
  return free.filter((s) => !full.has(`${s.hostId} ${day(s.startsAt)}`))
}

export async function lastHeldTalk(employeeId: string, before?: Date) {
  const conds = [eq(talks.employeeId, employeeId), eq(talks.status, 'gevoerd')]
  if (before) conds.push(lt(talks.heldAt, before))
  const [t] = await db.select().from(talks).where(and(...conds)).orderBy(desc(talks.heldAt)).limit(1)
  return t ?? null
}

// Voorbereiding van de leidinggevende, ontsleuteld.
export function hostPrep(talk: Talk): Record<string, string> {
  try {
    return JSON.parse(decrypt(talk.hostPrepEnc) || '{}')
  } catch {
    return {}
  }
}

export async function agreementsOf(talkId: string) {
  const rows = await db.select().from(agreements).where(eq(agreements.talkId, talkId)).orderBy(asc(agreements.createdAt))
  return rows.map((a) => ({ ...a, text: decrypt(a.textEnc) }))
}

export type PlainAnswer = {
  id: string
  questionId: string | null
  questionText: string
  answerType: 'tekst' | 'smiley' | 'keuze'
  value: string
  smiley: number | null
  note: string
  shared: boolean
}

function plain(a: typeof answers.$inferSelect): PlainAnswer {
  return {
    id: a.id,
    questionId: a.questionId,
    questionText: a.questionText,
    answerType: a.answerType,
    value: decrypt(a.valueEnc),
    smiley: a.smiley,
    note: decrypt(a.noteEnc),
    shared: a.shared,
  }
}

export async function talkAnswers(talkId: string, onlyShared = false) {
  const conds = [eq(answers.talkId, talkId)]
  if (onlyShared) conds.push(eq(answers.shared, true))
  const rows = await db.select().from(answers).where(and(...conds)).orderBy(asc(answers.position))
  return rows.map(plain)
}

// Weekchecks sinds het vorige gevoerde gesprek, met de antwoorden.
export async function weekchecksSince(employeeId: string, since: Date | null, onlyShared = false) {
  const conds = [eq(weekchecks.userId, employeeId)]
  if (since) conds.push(gt(weekchecks.createdAt, since))
  const checks = await db
    .select()
    .from(weekchecks)
    .where(and(...conds))
    .orderBy(desc(weekchecks.year), desc(weekchecks.week))
  if (!checks.length) return []
  const visible = await checkAnswers(checks.map((c) => c.id), onlyShared)
  return checks
    .map((c) => ({ ...c, answers: visible.filter((r) => r.weekcheckId === c.id) }))
    .filter((c) => !onlyShared || c.answers.length > 0)
}

// Antwoorden van weekchecks. Met onlyShared (voor de leidinggevende): wat gedeeld is, plus de smiley bij vragen
// waar die altijd zichtbaar is, zonder uitleg.
export async function checkAnswers(checkIds: string[], onlyShared: boolean) {
  if (!checkIds.length) return []
  const rows = await db
    .select({ a: answers, from: questions.smileyVisibleFrom })
    .from(answers)
    .leftJoin(questions, eq(questions.id, answers.questionId))
    .where(inArray(answers.weekcheckId, checkIds))
    .orderBy(asc(answers.position))
  return rows.flatMap(({ a, from }) => {
    const p = { ...plain(a), weekcheckId: a.weekcheckId }
    if (!onlyShared || a.shared) return [p]
    if (from && a.updatedAt >= from && a.smiley != null) return [{ ...p, value: '', note: '' }]
    return []
  })
}

export const SMILEYS = [
  { v: 1, emoji: '😞', label: 'Helemaal niet goed' },
  { v: 2, emoji: '🙁', label: 'Niet zo goed' },
  { v: 3, emoji: '😐', label: 'Gaat wel' },
  { v: 4, emoji: '🙂', label: 'Goed' },
  { v: 5, emoji: '😄', label: 'Heel goed' },
]
