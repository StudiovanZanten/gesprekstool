import 'server-only'
import { and, asc, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm'
import {
  actionItems,
  db,
  meetingItems,
  meetingTopics,
  meetings,
  organisations,
  users,
  type Meeting,
  type Organisation,
  type User,
} from '@/db'
import { decrypt, encrypt } from './crypto'
import { addDays, todayStr } from './dates'

// Het wekelijkse overleg. Het team (wie bij Instellingen aan het overleg is gekoppeld, plus de beheerder) leest mee,
// brengt vooraf onderwerpen in en vinkt actiepunten af. De beheerder is voorzitter, en kan per overleg een notulist kiezen.

export type FixedItem = { title: string; owner: string }

export const DEFAULT_FIXED_ITEMS: FixedItem[] = [
  { title: 'Rooster', owner: 'Bauke' },
  { title: 'Terugblik', owner: '' },
  { title: 'Nieuwe ontwikkelingen', owner: 'Reno en David' },
  { title: 'Zorg, dagbesteding', owner: 'Britt' },
  { title: 'Actueel', owner: '' },
  { title: 'Culinair, catering en agenda Brabantse Hoeve', owner: 'Eva' },
  { title: 'Rondvraag', owner: '' },
  { title: 'Smaek private en events', owner: 'David' },
]
export const WEEKDAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']

export function inTeam(user: User): boolean {
  return user.active && (user.role === 'beheerder' || user.inMeeting)
}

export function isChair(user: User): boolean {
  return user.role === 'beheerder'
}

// Notuleren mag de voorzitter en de notulist van dit overleg, zolang het niet is afgerond.
export function canEdit(user: User, m: Meeting): boolean {
  return !m.finishedAt && (isChair(user) || m.minuteTakerId === user.id)
}

// Bij agendapunten over deelnemers toont de tool een melding over namen en medische gegevens.
export function isPrivacyItem(title: string): boolean {
  return /zorg|dagbesteding|deelnemer/i.test(title)
}

export function fixedItemsOf(org: Organisation): FixedItem[] {
  if (!org.meetingFixedItems) return DEFAULT_FIXED_ITEMS
  try {
    const list = JSON.parse(org.meetingFixedItems)
    if (!Array.isArray(list)) return DEFAULT_FIXED_ITEMS
    return list
      .map((x) => (typeof x === 'string' ? { title: x, owner: '' } : { title: String(x?.title ?? ''), owner: String(x?.owner ?? '') }))
      .filter((x) => x.title)
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

export function mailOf(u: User): string | null {
  return u.meetingEmail || u.email
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

  const [created] = await db.insert(meetings).values({ orgId, date, time: org.meetingTime }).onConflictDoNothing().returning()
  if (!created) {
    const [m] = await db.select().from(meetings).where(and(eq(meetings.orgId, orgId), eq(meetings.date, date)))
    return m
  }
  await syncFixedItems(created.id, fixedItemsOf(org))
  return created
}

// Zet de vaste punten van een overleg gelijk aan de instellingen. Punten met notulen of onderwerpen blijven altijd staan.
export async function syncFixedItems(meetingId: string, fixed: FixedItem[]) {
  const items = await db.select().from(meetingItems).where(eq(meetingItems.meetingId, meetingId)).orderBy(asc(meetingItems.position))
  const topics = await db.select({ itemId: meetingTopics.itemId }).from(meetingTopics).where(eq(meetingTopics.meetingId, meetingId))
  const used = new Set(topics.map((t) => t.itemId))
  const byTitle = new Map(items.filter((i) => i.fixed).map((i) => [decrypt(i.titleEnc).toLowerCase(), i]))
  const order: string[] = []
  for (const f of fixed) {
    const have = byTitle.get(f.title.toLowerCase())
    if (have) {
      await db.update(meetingItems).set({ owner: f.owner || null }).where(eq(meetingItems.id, have.id))
      byTitle.delete(f.title.toLowerCase())
      order.push(have.id)
    } else {
      const [row] = await db
        .insert(meetingItems)
        .values({ meetingId, position: 0, titleEnc: encrypt(f.title)!, owner: f.owner || null, fixed: true })
        .returning()
      order.push(row.id)
    }
  }
  for (const old of byTitle.values()) {
    if (old.notesEnc || used.has(old.id)) order.push(old.id)
    else await db.delete(meetingItems).where(eq(meetingItems.id, old.id))
  }
  for (const i of items) if (!i.fixed) order.push(i.id)
  await renumberItems(order)
}

export async function renumberItems(order: string[]) {
  for (let i = 0; i < order.length; i++) await db.update(meetingItems).set({ position: (i + 1) * 10 }).where(eq(meetingItems.id, order[i]))
}

export async function loadMeeting(user: User, id: string): Promise<Meeting | null> {
  const [m] = await db.select().from(meetings).where(and(eq(meetings.id, id), eq(meetings.orgId, user.orgId)))
  return m ?? null
}

export type AgendaItem = {
  id: string
  title: string
  owner: string
  fixed: boolean
  notes: string
  decision: string
}

export async function agendaOf(meetingId: string): Promise<AgendaItem[]> {
  const rows = await db.select().from(meetingItems).where(eq(meetingItems.meetingId, meetingId)).orderBy(asc(meetingItems.position))
  return rows.map((r) => ({
    id: r.id,
    title: decrypt(r.titleEnc),
    owner: r.owner ?? '',
    fixed: r.fixed,
    notes: decrypt(r.notesEnc),
    decision: decrypt(r.decisionEnc),
  }))
}

export type Topic = {
  id: string
  itemId: string | null
  title: string
  explanation: string
  addedBy: string | null
  status: string
}

export async function topicsOf(meetingId: string): Promise<Topic[]> {
  const rows = await db.select().from(meetingTopics).where(eq(meetingTopics.meetingId, meetingId)).orderBy(asc(meetingTopics.createdAt))
  return rows.map((r) => ({
    id: r.id,
    itemId: r.itemId,
    title: decrypt(r.titleEnc),
    explanation: decrypt(r.explanationEnc),
    addedBy: r.addedBy,
    status: r.status,
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

// Open actiepunten uit eerdere vergaderingen. Die komen vanzelf terug tot iemand ze afvinkt.
// Met "sinds" komen ook de punten mee die na dat moment zijn afgevinkt, zodat je ziet wat er tijdens het overleg klaar is gezet.
export async function openActionsBefore(orgId: string, date: string, since?: Date | null): Promise<Action[]> {
  const earlier = await db.select({ id: meetings.id }).from(meetings).where(and(eq(meetings.orgId, orgId), lt(meetings.date, date)))
  if (!earlier.length) return []
  const rows = await db
    .select()
    .from(actionItems)
    .where(and(inArray(actionItems.meetingId, earlier.map((m) => m.id)), since ? or(isNull(actionItems.doneAt), gte(actionItems.doneAt, since)) : isNull(actionItems.doneAt)))
    .orderBy(asc(actionItems.dueDate), asc(actionItems.createdAt))
  return rows.map(toAction)
}

export async function openActionsOfOrg(orgId: string): Promise<Action[]> {
  const rows = await db
    .select()
    .from(actionItems)
    .where(and(eq(actionItems.orgId, orgId), isNull(actionItems.doneAt)))
    .orderBy(asc(actionItems.dueDate), asc(actionItems.createdAt))
  return rows.map(toAction)
}

export async function teamOf(orgId: string): Promise<User[]> {
  const all = await db.select().from(users).where(and(eq(users.orgId, orgId), eq(users.active, true))).orderBy(asc(users.name))
  return all.filter(inTeam)
}
