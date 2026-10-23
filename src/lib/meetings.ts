import 'server-only'
import { and, asc, eq, gte, inArray, isNull, lt } from 'drizzle-orm'
import { actionItems, db, employeeTypes, meetingItems, meetings, organisations, users, type Meeting, type Organisation, type User } from '@/db'
import { decrypt, encrypt } from './crypto'
import { addDays, todayStr } from './dates'

// Het wekelijkse overleg. Iedereen van de organisatie leest mee en zet punten op de agenda.
// Beheerder en stagebegeleider leiden het overleg en maken de notulen.

export const DEFAULT_FIXED_ITEMS = ['Terugblik op vorige week', 'Planning deze week', 'Deelnemers', 'Catering en bestellingen', 'Rondvraag']
export const WEEKDAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']

export function canLead(user: User): boolean {
  return user.role !== 'medewerker'
}

export function fixedItemsOf(org: Organisation): string[] {
  if (!org.meetingFixedItems) return DEFAULT_FIXED_ITEMS
  try {
    const list = JSON.parse(org.meetingFixedItems)
    return Array.isArray(list) ? list.map(String) : DEFAULT_FIXED_ITEMS
  } catch {
    return DEFAULT_FIXED_ITEMS
  }
}

export function presentOf(m: Meeting): string[] {
  try {
    const list = JSON.parse(m.present ?? '[]')
    return Array.isArray(list) ? list.map(String) : []
  } catch {
    return []
  }
}

function weekdayOf(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00Z').getUTCDay() || 7
}

// Het eerstvolgende overleg dat nog niet is afgerond. Bestaat het nog niet, dan zet de tool het klaar met de vaste punten.
export async function ensureNextMeeting(orgId: string): Promise<Meeting> {
  const today = todayStr()
  const [open] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.orgId, orgId), gte(meetings.date, addDays(today, -6)), isNull(meetings.finishedAt)))
    .orderBy(asc(meetings.date))
    .limit(1)
  if (open) return open

  const [org] = await db.select().from(organisations).where(eq(organisations.id, orgId))
  let date = today
  while (weekdayOf(date) !== org.meetingWeekday) date = addDays(date, 1)
  const [taken] = await db.select().from(meetings).where(and(eq(meetings.orgId, orgId), eq(meetings.date, date)))
  if (taken) date = addDays(date, 7)

  const [created] = await db
    .insert(meetings)
    .values({ orgId, date, time: org.meetingTime })
    .onConflictDoNothing()
    .returning()
  if (!created) {
    const [m] = await db.select().from(meetings).where(and(eq(meetings.orgId, orgId), eq(meetings.date, date)))
    return m
  }
  const fixed = fixedItemsOf(org)
  if (fixed.length) {
    await db.insert(meetingItems).values(
      fixed.map((title, i) => ({ meetingId: created.id, position: (i + 1) * 10, titleEnc: encrypt(title)!, fixed: true })),
    )
  }
  return created
}

export async function loadMeeting(user: User, id: string): Promise<Meeting | null> {
  const [m] = await db.select().from(meetings).where(and(eq(meetings.id, id), eq(meetings.orgId, user.orgId)))
  return m ?? null
}

export type AgendaItem = {
  id: string
  position: number
  title: string
  explanation: string
  addedBy: string | null
  fixed: boolean
  notes: string
  decision: string
}

export async function agendaOf(meetingId: string): Promise<AgendaItem[]> {
  const rows = await db.select().from(meetingItems).where(eq(meetingItems.meetingId, meetingId)).orderBy(asc(meetingItems.position))
  return rows.map((r) => ({
    id: r.id,
    position: r.position,
    title: decrypt(r.titleEnc),
    explanation: decrypt(r.explanationEnc),
    addedBy: r.addedBy,
    fixed: r.fixed,
    notes: decrypt(r.notesEnc),
    decision: decrypt(r.decisionEnc),
  }))
}

export type Action = {
  id: string
  meetingId: string
  itemId: string | null
  text: string
  ownerId: string | null
  dueDate: string | null
  doneAt: Date | null
}

function toAction(r: typeof actionItems.$inferSelect): Action {
  return { id: r.id, meetingId: r.meetingId, itemId: r.itemId, text: decrypt(r.textEnc), ownerId: r.ownerId, dueDate: r.dueDate, doneAt: r.doneAt }
}

export async function actionsOfMeeting(meetingId: string): Promise<Action[]> {
  const rows = await db.select().from(actionItems).where(eq(actionItems.meetingId, meetingId)).orderBy(asc(actionItems.createdAt))
  return rows.map(toAction)
}

// Open actiepunten uit eerdere vergaderingen. Die komen vanzelf terug op de agenda tot ze klaar zijn.
export async function openActionsBefore(orgId: string, date: string): Promise<Action[]> {
  const earlier = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(eq(meetings.orgId, orgId), lt(meetings.date, date)))
  if (!earlier.length) return []
  const rows = await db
    .select()
    .from(actionItems)
    .where(and(inArray(actionItems.meetingId, earlier.map((m) => m.id)), isNull(actionItems.doneAt)))
    .orderBy(asc(actionItems.dueDate), asc(actionItems.createdAt))
  return rows.map(toAction)
}

export async function openActionsOf(user: User): Promise<Action[]> {
  const rows = await db
    .select()
    .from(actionItems)
    .where(and(eq(actionItems.orgId, user.orgId), eq(actionItems.ownerId, user.id), isNull(actionItems.doneAt)))
    .orderBy(asc(actionItems.dueDate), asc(actionItems.createdAt))
  return rows.map(toAction)
}

// Stagiaires doen niet mee aan het overleg en zien de notulen niet.
export async function colleaguesOf(orgId: string): Promise<User[]> {
  const all = await db.select().from(users).where(and(eq(users.orgId, orgId), eq(users.active, true))).orderBy(asc(users.name))
  const interns = new Set(
    (await db.select({ id: employeeTypes.id }).from(employeeTypes).where(and(eq(employeeTypes.orgId, orgId), eq(employeeTypes.rhythm, 'stage')))).map((t) => t.id),
  )
  return all.filter((u) => !(u.role === 'medewerker' && u.typeId && interns.has(u.typeId)))
}
