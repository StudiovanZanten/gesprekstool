'use server'
import { and, eq, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, employeeTypes, organisations, slots, talkWeeks, talks } from '@/db'
import { requireAdmin, requireStaff } from '@/lib/auth'
import { amsterdamToDate, weeksInYear } from '@/lib/dates'

export async function stelWekenIn(typeId: string, year: number, fd: FormData) {
  const me = await requireAdmin()
  const [type] = await db.select().from(employeeTypes).where(and(eq(employeeTypes.id, typeId), eq(employeeTypes.orgId, me.orgId)))
  if (!type) redirect('/beheer/planning')
  const max = weeksInYear(year)
  const wanted = [...new Set(String(fd.get('weken') ?? '').split(/[^0-9]+/).filter(Boolean).map(Number))].filter((w) => w >= 1 && w <= max)
  const current = await db.select().from(talkWeeks).where(and(eq(talkWeeks.typeId, typeId), eq(talkWeeks.year, year)))
  let kept = 0
  for (const tw of current) {
    if (wanted.includes(tw.week)) continue
    const used = await db.select({ id: talks.id }).from(talks).where(eq(talks.talkWeekId, tw.id)).limit(1)
    if (used.length) kept++
    else await db.delete(talkWeeks).where(eq(talkWeeks.id, tw.id))
  }
  for (const w of wanted) {
    await db.insert(talkWeeks).values({ orgId: me.orgId, typeId, year, week: w }).onConflictDoNothing()
  }
  redirect(`/beheer/planning?melding=${kept ? 'bewaard-deels' : 'bewaard'}`)
}

export async function zetMomentenOpen(fd: FormData) {
  const me = await requireStaff()
  const [org] = await db.select().from(organisations).where(eq(organisations.id, me.orgId))
  const date = String(fd.get('datum') ?? '')
  const from = String(fd.get('van') ?? '')
  const to = String(fd.get('tot') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) {
    redirect('/beheer/planning?melding=fout')
  }
  const start = amsterdamToDate(date, from)
  const end = amsterdamToDate(date, to)
  const step = org.talkMinutes * 60000
  const rows = []
  for (let t = start.getTime(); t + step <= end.getTime() && rows.length < 40; t += step) {
    rows.push({ orgId: me.orgId, hostId: me.id, startsAt: new Date(t), endsAt: new Date(t + step) })
  }
  if (!rows.length) redirect('/beheer/planning?melding=fout')
  await db.insert(slots).values(rows)
  redirect(`/beheer/planning?melding=open&n=${rows.length}`)
}

export async function verwijderMoment(id: string) {
  const me = await requireStaff()
  await db.delete(slots).where(and(eq(slots.id, id), eq(slots.hostId, me.id), isNull(slots.talkId)))
  redirect('/beheer/planning')
}
