'use server'
import { and, asc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { actionItems, db, meetingItems, meetingTopics, meetings, reminders, users, type Meeting, type User } from '@/db'
import { requireUser } from '@/lib/auth'
import { encrypt } from '@/lib/crypto'
import { fmtDate } from '@/lib/dates'
import { appUrl, sendMail } from '@/lib/mail'
import {
  canEdit,
  ensureNextMeeting,
  inTeam,
  isChair,
  loadMeeting,
  mailOf,
  openActionsOfOrg,
  renumberItems,
  teamOf,
} from '@/lib/meetings'

const text = (v: FormDataEntryValue | null, max: number) => String(v ?? '').trim().slice(0, max)
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

// Altijd verversen voor het doorsturen, ook als alleen het #anker verandert. Anders toont het scherm oude notulen.
function go(url: string): never {
  revalidatePath('/vergaderingen', 'layout')
  redirect(url)
}
const back = (m: Meeting, query = '', anchor = '') => `/vergaderingen/${m.id}${query ? `?${query}` : ''}${anchor ? `#${anchor}` : ''}`

async function member(): Promise<User> {
  const me = await requireUser()
  if (!inTeam(me)) redirect('/')
  return me
}

async function meetingFor(me: User, id: string): Promise<Meeting> {
  const m = await loadMeeting(me, id)
  if (!m) go('/vergaderingen')
  return m
}

async function editor(id: string): Promise<{ me: User; m: Meeting }> {
  const me = await member()
  const m = await meetingFor(me, id)
  if (!canEdit(me, m)) go(back(m))
  return { me, m }
}

async function chair(id: string): Promise<{ me: User; m: Meeting }> {
  const me = await member()
  const m = await meetingFor(me, id)
  if (!isChair(me)) go(back(m))
  return { me, m }
}

// Alle knoppen in het notulenscherm bewaren eerst wat er is getypt, zodat er nooit iets verloren gaat.
async function saveAll(me: User, m: Meeting, fd: FormData): Promise<string | undefined> {
  if (!canEdit(me, m) || fd.get('notulenscherm') !== '1') return
  const items = await db.select().from(meetingItems).where(eq(meetingItems.meetingId, m.id))
  for (const it of items) {
    if (!fd.has(`notulen-${it.id}`)) continue
    await db
      .update(meetingItems)
      .set({ notesEnc: encrypt(text(fd.get(`notulen-${it.id}`), 20000)), decisionEnc: encrypt(text(fd.get(`besluit-${it.id}`), 5000)) })
      .where(eq(meetingItems.id, it.id))
  }
  const team = new Set((await teamOf(m.orgId)).map((u) => u.id))
  const set: Partial<Meeting> = { present: JSON.stringify(fd.getAll('aanwezig').map(String).filter((id) => team.has(id))) }
  let melding: string | undefined
  if (isChair(me)) {
    const taker = String(fd.get('notulist') ?? '')
    set.minuteTakerId = team.has(taker) ? taker : null
    const date = text(fd.get('datum'), 10)
    const time = text(fd.get('tijd'), 5)
    if (/^\d{2}:\d{2}$/.test(time)) set.time = time
    if (isDate(date) && date !== m.date) {
      const [taken] = await db.select({ id: meetings.id }).from(meetings).where(and(eq(meetings.orgId, m.orgId), eq(meetings.date, date)))
      if (taken) melding = 'datum-bezet'
      else set.date = date
    }
  }
  await db.update(meetings).set(set).where(eq(meetings.id, m.id))
  if (set.minuteTakerId && set.minuteTakerId !== m.minuteTakerId) await tellMinuteTaker(m, set.minuteTakerId)
  return melding
}

// De voorzitter wijst een notulist aan: die krijgt één keer per overleg een mail, en ziet het ook in de tool.
async function tellMinuteTaker(m: Meeting, userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId))
  const to = u && mailOf(u)
  if (!to) return
  const [first] = await db.insert(reminders).values({ userId: u.id, kind: 'notulist', ref: m.id }).onConflictDoNothing().returning()
  if (!first) return
  try {
    await sendMail(
      { email: to, name: u.name },
      `Je bent notulist bij het overleg van ${fmtDate(m.date)}`,
      `Hoi ${u.name.split(' ')[0]},\n\nJe bent aangewezen als notulist bij het overleg van ${fmtDate(m.date)} om ${m.time} uur. Open het overleg in de tool, dan kun je per agendapunt aantekeningen maken.\n\n${appUrl(`/vergaderingen/${m.id}`)}\n`,
    )
  } catch (e) {
    console.error('[mail] notulist niet verstuurd', e)
  }
}

export async function bewaar(meetingId: string, fd: FormData) {
  const { me, m } = await editor(meetingId)
  const melding = await saveAll(me, m, fd)
  go(back(m, `melding=${melding ?? 'bewaard'}`))
}

// Vergadermodus: zet een ander punt aan de beurt. Iedereen ziet dat binnen een paar tellen op zijn eigen scherm.
export async function naarPunt(meetingId: string, itemId: string | null, fd: FormData) {
  const { me, m } = await editor(meetingId)
  await saveAll(me, m, fd)
  await db.update(meetings).set({ currentItemId: itemId }).where(eq(meetings.id, m.id))
  go(back(m, '', itemId ? `punt-${itemId}` : ''))
}

// Een onderwerp inbrengen bij een agendapunt. Van een collega is het een verzoek, de voorzitter zet het meteen op de agenda.
export async function onderwerpInbrengen(meetingId: string, fd: FormData) {
  const me = await member()
  const m = await meetingFor(me, meetingId)
  const toOverview = fd.get('terug') === 'overzicht'
  if (m.finishedAt) go(toOverview ? '/vergaderingen' : back(m))
  await saveAll(me, m, fd)
  const title = text(fd.get('onderwerp'), 200)
  if (!title) go(toOverview ? '/vergaderingen?melding=leeg' : back(m, 'melding=leeg'))
  const itemId = String(fd.get('agendapunt') ?? '')
  const [it] = await db.select().from(meetingItems).where(and(eq(meetingItems.id, itemId), eq(meetingItems.meetingId, m.id)))
  await db.insert(meetingTopics).values({
    meetingId: m.id,
    itemId: it?.id ?? null,
    titleEnc: encrypt(title)!,
    explanationEnc: encrypt(text(fd.get('toelichting'), 2000)),
    addedBy: me.id,
    status: isChair(me) ? 'akkoord' : 'verzoek',
  })
  go(toOverview ? '/vergaderingen?melding=ingebracht' : back(m, 'melding=ingebracht'))
}

async function topicFor(me: User, topicId: string) {
  const [row] = await db
    .select({ topic: meetingTopics, meeting: meetings })
    .from(meetingTopics)
    .innerJoin(meetings, eq(meetings.id, meetingTopics.meetingId))
    .where(and(eq(meetingTopics.id, topicId), eq(meetings.orgId, me.orgId)))
  if (!row) go('/vergaderingen')
  return row
}

export async function verzoekBeslissen(topicId: string, status: 'akkoord' | 'niet' | 'verzoek', fd: FormData) {
  const me = await member()
  const { topic, meeting } = await topicFor(me, topicId)
  if (!isChair(me) || meeting.finishedAt) go(back(meeting))
  await saveAll(me, meeting, fd)
  await db.update(meetingTopics).set({ status }).where(eq(meetingTopics.id, topic.id))
  go(fd.get('terug') === 'overzicht' ? '/vergaderingen' : back(meeting, '', topic.itemId ? `punt-${topic.itemId}` : ''))
}

// Weghalen mag wie het onderwerp inbracht, of de voorzitter.
export async function onderwerpWeg(topicId: string, fd: FormData) {
  const me = await member()
  const { topic, meeting } = await topicFor(me, topicId)
  if (meeting.finishedAt || !(isChair(me) || topic.addedBy === me.id)) go(back(meeting))
  await saveAll(me, meeting, fd)
  await db.delete(meetingTopics).where(eq(meetingTopics.id, topic.id))
  go(fd.get('terug') === 'overzicht' ? '/vergaderingen' : back(meeting))
}

// Een extra agendapunt alleen voor dit overleg. De vaste punten pas je aan bij Instellingen.
export async function puntToevoegen(meetingId: string, fd: FormData) {
  const { me, m } = await chair(meetingId)
  if (m.finishedAt) go(back(m))
  await saveAll(me, m, fd)
  const title = text(fd.get('nieuw-titel'), 200)
  if (!title) go(back(m, 'melding=leeg'))
  const items = await db.select().from(meetingItems).where(eq(meetingItems.meetingId, m.id)).orderBy(asc(meetingItems.position))
  const [row] = await db
    .insert(meetingItems)
    .values({ meetingId: m.id, position: 0, titleEnc: encrypt(title)!, owner: text(fd.get('nieuw-eigenaar'), 100) || null, addedBy: me.id })
    .returning()
  await renumberItems([...items.map((i) => i.id), row.id])
  go(back(m, '', `punt-${row.id}`))
}

export async function puntVerplaatsen(meetingId: string, itemId: string, dir: -1 | 1, fd: FormData) {
  const { me, m } = await chair(meetingId)
  await saveAll(me, m, fd)
  const items = await db.select().from(meetingItems).where(eq(meetingItems.meetingId, m.id)).orderBy(asc(meetingItems.position))
  const order = items.map((i) => i.id)
  const at = order.indexOf(itemId)
  const to = at + dir
  if (at >= 0 && to >= 0 && to < order.length) {
    ;[order[at], order[to]] = [order[to], order[at]]
    await renumberItems(order)
  }
  go(back(m, '', `punt-${itemId}`))
}

export async function puntWeg(meetingId: string, itemId: string, fd: FormData) {
  const { me, m } = await chair(meetingId)
  if (m.finishedAt) go(back(m))
  await saveAll(me, m, fd)
  await db.delete(meetingItems).where(and(eq(meetingItems.id, itemId), eq(meetingItems.meetingId, m.id)))
  if (m.currentItemId === itemId) await db.update(meetings).set({ currentItemId: null }).where(eq(meetings.id, m.id))
  go(back(m))
}

async function insertAction(m: Meeting, itemId: string, what: string, owner: string, due: string) {
  const team = new Set((await teamOf(m.orgId)).map((u) => u.id))
  const [it] = await db.select().from(meetingItems).where(and(eq(meetingItems.id, itemId), eq(meetingItems.meetingId, m.id)))
  await db.insert(actionItems).values({
    orgId: m.orgId,
    meetingId: m.id,
    itemId: it?.id ?? null,
    textEnc: encrypt(what)!,
    ownerId: team.has(owner) ? owner : null,
    dueDate: isDate(due) ? due : null,
  })
}

export async function actieToevoegen(meetingId: string, itemId: string, fd: FormData) {
  const { me, m } = await editor(meetingId)
  await saveAll(me, m, fd)
  const what = text(fd.get(`actie-${itemId}`), 1000)
  if (!what) go(back(m, 'melding=actie-leeg', `punt-${itemId}`))
  await insertAction(m, itemId, what, String(fd.get(`wie-${itemId}`) ?? ''), text(fd.get(`wanneer-${itemId}`), 10))
  go(back(m, '', `punt-${itemId}`))
}

// Bewaart de notulen en toont daarna de voorgestelde actiepunten uit de aantekeningen van dit punt.
export async function herkennen(meetingId: string, itemId: string, fd: FormData) {
  const { me, m } = await editor(meetingId)
  await saveAll(me, m, fd)
  go(back(m, `herken=${itemId}`, `punt-${itemId}`))
}

// Slaat alleen de voorstellen op die zijn aangevinkt, zoals ze in het scherm zijn aangepast.
export async function bevestigen(meetingId: string, itemId: string, fd: FormData) {
  const { me, m } = await editor(meetingId)
  await saveAll(me, m, fd)
  const count = Math.min(Number(fd.get(`voorstellen-${itemId}`)) || 0, 50)
  for (let i = 0; i < count; i++) {
    const p = `v-${itemId}-${i}`
    if (fd.get(`${p}-aan`) !== 'on') continue
    const what = text(fd.get(`${p}-tekst`), 1000)
    if (what) await insertAction(m, itemId, what, String(fd.get(`${p}-wie`) ?? ''), text(fd.get(`${p}-wanneer`), 10))
  }
  go(back(m, '', `punt-${itemId}`))
}

// Iedereen van het team mag een actiepunt afvinken of weer openzetten.
export async function actieKlaar(actionId: string, done: boolean, fd: FormData) {
  const me = await member()
  const [a] = await db.select().from(actionItems).where(and(eq(actionItems.id, actionId), eq(actionItems.orgId, me.orgId)))
  if (!a) go('/vergaderingen')
  const from = String(fd.get('vergadering') ?? '')
  const m = from ? await loadMeeting(me, from) : null
  if (m) await saveAll(me, m, fd)
  await db
    .update(actionItems)
    .set(done ? { doneAt: new Date(), doneBy: me.id } : { doneAt: null, doneBy: null })
    .where(eq(actionItems.id, a.id))
  go(m ? back(m, '', a.itemId && a.meetingId === m.id ? `punt-${a.itemId}` : 'eerder') : '/vergaderingen#acties')
}

export async function actieWeg(meetingId: string, actionId: string, fd: FormData) {
  const { me, m } = await editor(meetingId)
  await saveAll(me, m, fd)
  await db.delete(actionItems).where(and(eq(actionItems.id, actionId), eq(actionItems.meetingId, m.id)))
  go(back(m))
}

// Afronden: notulen vastzetten, ieder teamlid een mail met alleen de eigen open actiepunten sturen en het volgende overleg klaarzetten.
export async function afronden(meetingId: string, fd: FormData) {
  const { me, m } = await editor(meetingId)
  await saveAll(me, m, fd)
  await db.update(meetings).set({ finishedAt: new Date(), finishedBy: me.id, currentItemId: null }).where(eq(meetings.id, m.id))
  const open = await openActionsOfOrg(m.orgId)
  for (const u of await teamOf(m.orgId)) {
    const to = mailOf(u)
    if (!to) continue
    const [first] = await db.insert(reminders).values({ userId: u.id, kind: 'notulen', ref: m.id }).onConflictDoNothing().returning()
    if (!first) continue
    const mine = open.filter((a) => a.ownerId === u.id)
    const list = mine.length
      ? `Jouw open actiepunten:\n\n${mine.map((a) => `• ${a.text}${a.dueDate ? ` (uiterlijk ${fmtDate(a.dueDate)})` : ''}`).join('\n')}\n\nKlaar met een actiepunt? Vink het af in de tool.`
      : 'Je hebt geen open actiepunten.'
    try {
      await sendMail(
        { email: to, name: u.name },
        mine.length ? `Je actiepunten uit het overleg van ${fmtDate(m.date)}` : `Overleg van ${fmtDate(m.date)}`,
        `Hoi ${u.name.split(' ')[0]},\n\nHet overleg van ${fmtDate(m.date)} is afgerond. De notulen staan in de tool.\n\n${list}\n\n${appUrl(`/vergaderingen/${m.id}`)}\n`,
      )
    } catch (e) {
      console.error('[mail] actiepunten niet verstuurd', e)
    }
  }
  await ensureNextMeeting(m.orgId)
  go(back(m, 'melding=afgerond'))
}

export async function heropenen(meetingId: string) {
  const { m } = await chair(meetingId)
  await db.update(meetings).set({ finishedAt: null, finishedBy: null }).where(eq(meetings.id, m.id))
  go(back(m))
}

// Ieder teamlid kiest zelf op welk mailadres de actiepunten binnenkomen.
export async function mijnMailadres(fd: FormData) {
  const me = await member()
  const email = text(fd.get('mail'), 200).toLowerCase()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) go('/vergaderingen?melding=mail-fout#mail')
  await db.update(users).set({ meetingEmail: email || null }).where(eq(users.id, me.id))
  go('/vergaderingen?melding=mail#mail')
}
