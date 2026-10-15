'use server'
import { and, eq, gte, inArray, isNull, lt, ne } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { answers, db, employeeTypes, organisations, slots, talkWeeks, talks } from '@/db'
import { requireAdmin, requireStaff } from '@/lib/auth'
import { addDays, amsterdamToDate, roundLabel, weeksInYear } from '@/lib/dates'

const MAX_DAYS = 62
const MAX_SLOTS = 400

// Bewaart de gespreksrondes van één type in één jaar. Elke ronde loopt van een week tot en met een week.
export async function stelWekenIn(typeId: string, year: number, fd: FormData) {
  const me = await requireAdmin()
  const [type] = await db.select().from(employeeTypes).where(and(eq(employeeTypes.id, typeId), eq(employeeTypes.orgId, me.orgId)))
  if (!type) redirect('/beheer/planning')
  const max = weeksInYear(year)
  const num = (v: FormDataEntryValue | undefined) => Number(String(v ?? '').replace(/[^0-9]/g, '')) || 0
  const vans = fd.getAll('van')
  const tots = fd.getAll('tot')
  const wanted: { week: number; weekEnd: number }[] = []
  for (let i = 0; i < vans.length; i++) {
    const week = num(vans[i])
    if (!week) continue
    const weekEnd = num(tots[i]) || week
    if (week < 1 || week > max || weekEnd < week || weekEnd > max) redirect('/beheer/planning?melding=weken-fout')
    wanted.push({ week, weekEnd })
  }
  wanted.sort((a, b) => a.week - b.week)
  for (let i = 1; i < wanted.length; i++) {
    if (wanted[i].week <= wanted[i - 1].weekEnd) redirect('/beheer/planning?melding=weken-overlap')
  }

  const current = await db.select().from(talkWeeks).where(and(eq(talkWeeks.typeId, typeId), eq(talkWeeks.year, year)))
  let kept = 0
  for (const tw of current) {
    if (wanted.some((w) => w.week === tw.week)) continue
    // Een ronde mag weg als er nog niets mee gedaan is: geen gekozen moment en geen antwoorden.
    const linked = await db.select().from(talks).where(eq(talks.talkWeekId, tw.id))
    const busy = linked.some((t) => t.status !== 'open')
    const answered = linked.length
      ? (await db.select({ id: answers.id }).from(answers).where(inArray(answers.talkId, linked.map((t) => t.id))).limit(1)).length > 0
      : false
    if (busy || answered) {
      kept++
      continue
    }
    if (linked.length) await db.delete(talks).where(inArray(talks.id, linked.map((t) => t.id)))
    await db.delete(talkWeeks).where(eq(talkWeeks.id, tw.id))
  }
  for (const w of wanted) {
    const [row] = await db
      .insert(talkWeeks)
      .values({ orgId: me.orgId, typeId, year, week: w.week, weekEnd: w.weekEnd })
      .onConflictDoUpdate({ target: [talkWeeks.typeId, talkWeeks.year, talkWeeks.week], set: { weekEnd: w.weekEnd } })
      .returning()
    await db
      .update(talks)
      .set({ label: roundLabel(year, w.week, w.weekEnd) })
      .where(and(eq(talks.talkWeekId, row.id), ne(talks.status, 'gevoerd')))
  }
  redirect(`/beheer/planning?melding=${kept ? 'bewaard-deels' : 'bewaard'}`)
}

// Zet momenten open voor een of meer dagen. Bestaande momenten op hetzelfde tijdstip blijven staan en worden niet dubbel gemaakt.
export async function zetMomentenOpen(fd: FormData) {
  const me = await requireStaff()
  const [org] = await db.select().from(organisations).where(eq(organisations.id, me.orgId))
  const first = String(fd.get('datum') ?? '')
  const last = String(fd.get('totdatum') ?? '') || first
  const from = String(fd.get('van') ?? '')
  const to = String(fd.get('tot') ?? '')
  const weekdays = new Set(fd.getAll('dag').map(Number))
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)
  if (!isDate(first) || !isDate(last) || last < first || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) {
    redirect('/beheer/planning?melding=fout')
  }
  if (addDays(first, MAX_DAYS) < last) redirect('/beheer/planning?melding=te-lang')
  const days: string[] = []
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const wd = new Date(d + 'T12:00:00Z').getUTCDay() || 7
    // Eén dag gekozen: altijd die dag. Meerdere dagen: alleen de aangevinkte weekdagen.
    if (first === last || weekdays.has(wd)) days.push(d)
  }
  const step = org.talkMinutes * 60000
  const existing = await db
    .select({ startsAt: slots.startsAt, endsAt: slots.endsAt })
    .from(slots)
    .where(and(eq(slots.hostId, me.id), gte(slots.startsAt, amsterdamToDate(first, '00:00')), lt(slots.startsAt, amsterdamToDate(addDays(last, 1), '00:00'))))
  const overlaps = (a: number, b: number) => existing.some((e) => a < e.endsAt.getTime() && e.startsAt.getTime() < b)
  const rows = []
  for (const d of days) {
    const end = amsterdamToDate(d, to).getTime()
    for (let t = amsterdamToDate(d, from).getTime(); t + step <= end && rows.length < MAX_SLOTS; t += step) {
      if (!overlaps(t, t + step)) rows.push({ orgId: me.orgId, hostId: me.id, startsAt: new Date(t), endsAt: new Date(t + step) })
    }
  }
  if (!rows.length) redirect('/beheer/planning?melding=geen')
  await db.insert(slots).values(rows)
  redirect(`/beheer/planning?melding=open&n=${rows.length}`)
}

export async function verwijderMoment(id: string) {
  const me = await requireStaff()
  await db.delete(slots).where(and(eq(slots.id, id), eq(slots.hostId, me.id), isNull(slots.talkId)))
  redirect('/beheer/planning')
}
