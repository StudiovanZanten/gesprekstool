'use server'
import { and, asc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { actionItems, db, meetingItems, meetings, reminders, type Meeting, type User } from '@/db'
import { isIntern } from '@/lib/access'
import { requireUser } from '@/lib/auth'
import { encrypt } from '@/lib/crypto'
import { fmtDate } from '@/lib/dates'
import { appUrl, sendMail } from '@/lib/mail'
import { canLead, colleaguesOf, ensureNextMeeting, loadMeeting } from '@/lib/meetings'

const text = (v: FormDataEntryValue | null, max: number) => String(v ?? '').trim().slice(0, max)
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)
// Altijd verversen voor het doorsturen, ook als alleen het #anker verandert. Anders toont het scherm oude notulen.
function go(url: string): never {
  revalidatePath('/vergaderingen', 'layout')
  redirect(url)
}
const back = (m: Meeting, melding?: string) => `/vergaderingen/${m.id}${melding ? `?melding=${melding}` : ''}`

async function attendee(): Promise<User> {
  const me = await requireUser()
  if (await isIntern(me)) redirect('/mijn')
  return me
}

async function meetingFor(me: User, id: string): Promise<Meeting> {
  const m = await loadMeeting(me, id)
  if (!m) go('/vergaderingen')
  return m
}

async function leader(id: string): Promise<{ me: User; m: Meeting }> {
  const me = await attendee()
  const m = await meetingFor(me, id)
  if (!canLead(me)) go(back(m))
  return { me, m }
}

// Alle knoppen in het notulenscherm bewaren eerst wat er is getypt, zodat er nooit iets verloren gaat.
async function saveAll(me: User, m: Meeting, fd: FormData): Promise<string | undefined> {
  if (!canLead(me) || m.finishedAt || fd.get('notulenscherm') !== '1') return
  const items = await db.select().from(meetingItems).where(eq(meetingItems.meetingId, m.id))
  for (const it of items) {
    if (!fd.has(`notulen-${it.id}`)) continue
    await db
      .update(meetingItems)
      .set({ notesEnc: encrypt(text(fd.get(`notulen-${it.id}`), 20000)), decisionEnc: encrypt(text(fd.get(`besluit-${it.id}`), 5000)) })
      .where(eq(meetingItems.id, it.id))
  }
  const colleagues = new Set((await colleaguesOf(m.orgId)).map((u) => u.id))
  const present = fd.getAll('aanwezig').map(String).filter((id) => colleagues.has(id))
  const date = text(fd.get('datum'), 10)
  const time = text(fd.get('tijd'), 5)
  const set: Partial<Meeting> = { present: JSON.stringify(present) }
  if (/^\d{2}:\d{2}$/.test(time)) set.time = time
  let melding: string | undefined
  if (isDate(date) && date !== m.date) {
    const [taken] = await db.select({ id: meetings.id }).from(meetings).where(and(eq(meetings.orgId, m.orgId), eq(meetings.date, date)))
    if (taken) melding = 'datum-bezet'
    else set.date = date
  }
  await db.update(meetings).set(set).where(eq(meetings.id, m.id))
  return melding
}

export async function bewaar(meetingId: string, fd: FormData) {
  const { me, m } = await leader(meetingId)
  const melding = await saveAll(me, m, fd)
  go(back(m, melding ?? 'bewaard'))
}

export async function puntToevoegen(meetingId: string, fd: FormData) {
  const me = await attendee()
  const m = await meetingFor(me, meetingId)
  if (m.finishedAt) go(back(m))
  await saveAll(me, m, fd)
  const title = text(fd.get('nieuw-titel'), 200)
  if (!title) go(back(m, 'punt-leeg'))
  const items = await db.select().from(meetingItems).where(eq(meetingItems.meetingId, m.id)).orderBy(asc(meetingItems.position))
  const [row] = await db
    .insert(meetingItems)
    .values({ meetingId: m.id, position: 0, titleEnc: encrypt(title)!, explanationEnc: encrypt(text(fd.get('nieuw-toelichting'), 2000)), addedBy: me.id })
    .returning()
  // Een nieuw punt komt voor het laatste vaste punt (meestal de rondvraag).
  const order = items.map((i) => i.id)
  const last = items[items.length - 1]
  order.splice(last?.fixed ? order.length - 1 : order.length, 0, row.id)
  await renumber(order)
  go(fd.get('terug') === 'overzicht' ? '/vergaderingen?melding=punt' : back(m, 'punt'))
}

async function renumber(order: string[]) {
  for (let i = 0; i < order.length; i++) await db.update(meetingItems).set({ position: (i + 1) * 10 }).where(eq(meetingItems.id, order[i]))
}

export async function puntVerplaatsen(meetingId: string, itemId: string, dir: -1 | 1, fd: FormData) {
  const { me, m } = await leader(meetingId)
  await saveAll(me, m, fd)
  const items = await db.select().from(meetingItems).where(eq(meetingItems.meetingId, m.id)).orderBy(asc(meetingItems.position))
  const order = items.map((i) => i.id)
  const at = order.indexOf(itemId)
  const to = at + dir
  if (at >= 0 && to >= 0 && to < order.length) {
    ;[order[at], order[to]] = [order[to], order[at]]
    await renumber(order)
  }
  go(back(m))
}

// Een punt weghalen mag de leiding, of wie het punt inbracht zolang het overleg nog niet is afgerond.
export async function puntWeg(meetingId: string, itemId: string, fd: FormData) {
  const me = await attendee()
  const m = await meetingFor(me, meetingId)
  const [it] = await db.select().from(meetingItems).where(and(eq(meetingItems.id, itemId), eq(meetingItems.meetingId, m.id)))
  if (!it || m.finishedAt || !(canLead(me) || it.addedBy === me.id)) go(back(m))
  await saveAll(me, m, fd)
  await db.delete(meetingItems).where(eq(meetingItems.id, it.id))
  go(fd.get('terug') === 'overzicht' ? '/vergaderingen' : back(m))
}

export async function actieToevoegen(meetingId: string, itemId: string, fd: FormData) {
  const { me, m } = await leader(meetingId)
  if (m.finishedAt) go(back(m))
  await saveAll(me, m, fd)
  const what = text(fd.get(`actie-${itemId}`), 1000)
  if (!what) go(back(m, 'actie-leeg'))
  const [it] = await db.select().from(meetingItems).where(and(eq(meetingItems.id, itemId), eq(meetingItems.meetingId, m.id)))
  const colleagues = new Set((await colleaguesOf(m.orgId)).map((u) => u.id))
  const owner = String(fd.get(`wie-${itemId}`) ?? '')
  const due = text(fd.get(`wanneer-${itemId}`), 10)
  await db.insert(actionItems).values({
    orgId: m.orgId,
    meetingId: m.id,
    itemId: it?.id ?? null,
    textEnc: encrypt(what)!,
    ownerId: colleagues.has(owner) ? owner : null,
    dueDate: isDate(due) ? due : null,
  })
  go(`${back(m)}#punt-${itemId}`)
}

// Afvinken mag de leiding en degene die het actiepunt heeft.
export async function actieKlaar(actionId: string, done: boolean, fd: FormData) {
  const me = await attendee()
  const [a] = await db.select().from(actionItems).where(and(eq(actionItems.id, actionId), eq(actionItems.orgId, me.orgId)))
  if (!a || !(canLead(me) || a.ownerId === me.id)) go('/vergaderingen')
  const from = String(fd.get('vergadering') ?? '')
  const m = from ? await loadMeeting(me, from) : null
  if (m) await saveAll(me, m, fd)
  await db
    .update(actionItems)
    .set(done ? { doneAt: new Date(), doneBy: me.id } : { doneAt: null, doneBy: null })
    .where(eq(actionItems.id, a.id))
  go(m ? back(m) : '/vergaderingen')
}

export async function actieWeg(meetingId: string, actionId: string, fd: FormData) {
  const { me, m } = await leader(meetingId)
  await saveAll(me, m, fd)
  await db.delete(actionItems).where(and(eq(actionItems.id, actionId), eq(actionItems.meetingId, m.id)))
  go(back(m))
}

// Afronden: notulen vastzetten, iedereen een seintje sturen en het volgende overleg klaarzetten.
export async function afronden(meetingId: string, fd: FormData) {
  const { me, m } = await leader(meetingId)
  await saveAll(me, m, fd)
  await db.update(meetings).set({ finishedAt: new Date(), finishedBy: me.id }).where(eq(meetings.id, m.id))
  const actions = await db.select().from(actionItems).where(eq(actionItems.meetingId, m.id))
  for (const u of await colleaguesOf(m.orgId)) {
    if (!u.email) continue
    const [first] = await db.insert(reminders).values({ userId: u.id, kind: 'notulen', ref: m.id }).onConflictDoNothing().returning()
    if (!first) continue
    const mine = actions.filter((a) => a.ownerId === u.id).length
    const extra = mine ? `\n\nEr ${mine === 1 ? 'staat 1 actiepunt' : `staan ${mine} actiepunten`} op jouw naam.` : ''
    try {
      await sendMail(
        { email: u.email, name: u.name },
        'De notulen van het overleg staan klaar',
        `Hoi ${u.name.split(' ')[0]},\n\nDe notulen van het overleg van ${fmtDate(m.date)} staan klaar.${extra}\n\n${appUrl(`/vergaderingen/${m.id}`)}\n`,
      )
    } catch (e) {
      console.error('[mail] notulen niet verstuurd', e)
    }
  }
  await ensureNextMeeting(m.orgId)
  go(back(m, 'afgerond'))
}

export async function heropenen(meetingId: string) {
  const { m } = await leader(meetingId)
  await db.update(meetings).set({ finishedAt: null, finishedBy: null }).where(eq(meetings.id, m.id))
  go(back(m))
}
