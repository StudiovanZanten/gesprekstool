'use server'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { answers, db, employeeTypes, slots, talks, users } from '@/db'
import { saveAnswers } from '@/lib/answers'
import { requireUser } from '@/lib/auth'
import { fmtDate, fmtTime } from '@/lib/dates'
import { appUrl, sendMail } from '@/lib/mail'
import { activeQuestions, freeSlotsFor, lastHeldTalk, slotForTalk, weekchecksSince } from '@/lib/talks'

async function ownTalk(talkId: string) {
  const user = await requireUser()
  const [talk] = await db.select().from(talks).where(and(eq(talks.id, talkId), eq(talks.employeeId, user.id)))
  if (!talk || talk.status === 'gevoerd') redirect('/mijn/gesprek')
  return { user, talk }
}

export async function kiesMoment(talkId: string, fd: FormData) {
  const { user, talk } = await ownTalk(talkId)
  const slotId = String(fd.get('slot') ?? '')
  const free = await freeSlotsFor(user, talk)
  const chosen = free.find((s) => s.id === slotId)
  if (!chosen) redirect('/mijn/gesprek?melding=bezet')
  const old = await slotForTalk(talk.id)
  if (old && old.startsAt.getTime() - Date.now() < 2 * 86400000) redirect('/mijn/gesprek?melding=telaat')
  if (old) await db.update(slots).set({ talkId: null }).where(eq(slots.id, old.id))
  const [taken] = await db
    .update(slots)
    .set({ talkId: talk.id })
    .where(and(eq(slots.id, chosen.id), isNull(slots.talkId)))
    .returning()
  if (!taken) redirect('/mijn/gesprek?melding=bezet')
  await db
    .update(talks)
    .set({ hostId: taken.hostId, status: talk.status === 'open' ? 'gepland' : talk.status })
    .where(eq(talks.id, talk.id))
  const [host] = await db.select().from(users).where(eq(users.id, taken.hostId))
  if (host?.email) {
    await sendMail(
      { email: host.email, name: host.name },
      `Gesprek met ${user.name}: ${fmtDate(taken.startsAt)} om ${fmtTime(taken.startsAt)}`,
      `Hoi ${host.name},\n\n${user.name} heeft een moment gekozen voor het gesprek: ${fmtDate(taken.startsAt)} om ${fmtTime(taken.startsAt)} uur.\n\nZet het in je agenda via:\n${appUrl(`/agenda/${taken.id}`)}\n`,
    )
  }
  redirect('/mijn/gesprek?melding=gekozen')
}

export async function bewaarVoorbereiding(talkId: string, fd: FormData) {
  const { user, talk } = await ownTalk(talkId)
  const [type] = user.typeId ? await db.select().from(employeeTypes).where(eq(employeeTypes.id, user.typeId)) : []
  const qs = await activeQuestions(type?.questionnaireId ?? null)
  await saveAnswers({ orgId: user.orgId, userId: user.id, talkId: talk.id, questions: qs, fd })
  redirect(fd.get('later') ? '/mijn/gesprek' : '/mijn/gesprek?delen=1')
}

export async function deelAntwoorden(talkId: string, fd: FormData) {
  const { user, talk } = await ownTalk(talkId)
  const prev = await lastHeldTalk(user.id)
  const own = [
    ...(await db.select({ id: answers.id }).from(answers).where(eq(answers.talkId, talk.id))).map((a) => a.id),
    ...(await weekchecksSince(user.id, prev?.heldAt ?? null)).flatMap((c) => c.answers.map((a) => a.id)),
  ]
  const chosen = new Set(fd.getAll('deel').map(String))
  const on = own.filter((id) => chosen.has(id))
  const off = own.filter((id) => !chosen.has(id))
  if (on.length) await db.update(answers).set({ shared: true }).where(and(inArray(answers.id, on), eq(answers.userId, user.id)))
  if (off.length) await db.update(answers).set({ shared: false }).where(and(inArray(answers.id, off), eq(answers.userId, user.id)))
  const first = !talk.sharedAt
  await db.update(talks).set({ status: 'gedeeld', sharedAt: talk.sharedAt ?? new Date() }).where(eq(talks.id, talk.id))
  if (first && talk.hostId) {
    const [host] = await db.select().from(users).where(eq(users.id, talk.hostId))
    if (host?.email) {
      await sendMail(
        { email: host.email, name: host.name },
        `${user.name} heeft de voorbereiding gedeeld`,
        `Hoi ${host.name},\n\n${user.name} heeft de voorbereiding voor het gesprek gedeeld. Je vindt het gespreksoverzicht na het inloggen.\n\n${appUrl(`/beheer/gesprek/${talk.id}`)}\n`,
      )
    }
  }
  redirect('/mijn/gesprek?melding=gedeeld')
}
