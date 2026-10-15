import { eq } from 'drizzle-orm'
import { db, organisations, slots, talks, users } from '@/db'
import { currentUser } from '@/lib/auth'

// Agendabestand (.ics) voor een gekozen moment. Alleen voor de medewerker en de gespreksvoerder.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const user = await currentUser()
  if (!user) return new Response('Niet ingelogd', { status: 401 })
  const [row] = await db
    .select({ slot: slots, talk: talks })
    .from(slots)
    .innerJoin(talks, eq(talks.id, slots.talkId))
    .where(eq(slots.id, id))
  if (!row || (row.talk.employeeId !== user.id && row.slot.hostId !== user.id)) {
    return new Response('Niet gevonden', { status: 404 })
  }
  const [emp] = await db.select().from(users).where(eq(users.id, row.talk.employeeId))
  const [org] = await db.select().from(organisations).where(eq(organisations.id, user.orgId))
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const title = user.id === emp.id ? `Gesprek ${org.name}` : `Gesprek met ${emp.name}`
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gesprekstool//NL',
    'BEGIN:VEVENT',
    `UID:${row.slot.id}@gesprekstool`,
    `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(row.slot.startsAt)}`,
    `DTEND:${f(row.slot.endsAt)}`,
    `SUMMARY:${title}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  return new Response(ics, {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="gesprek.ics"' },
  })
}
