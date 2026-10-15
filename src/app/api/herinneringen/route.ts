import { and, eq, isNotNull, lt, ne } from 'drizzle-orm'
import {
  db,
  loginAttempts,
  loginTokens,
  organisations,
  reminders,
  sessions,
  slots,
  talkWeeks,
  talks,
  users,
} from '@/db'
import { addDays, fmtDate, fmtTime, isoWeek, mondayOfWeek, todayStr } from '@/lib/dates'
import { appUrl, sendMail } from '@/lib/mail'
import { ensureTalks } from '@/lib/talks'

// Draait elke ochtend (zie vercel.json). Stuurt herinneringen en ruimt oude gegevens op.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Geen toegang', { status: 401 })
  }
  const log: string[] = []
  const today = todayStr()
  const now = new Date()
  const { year, week } = isoWeek(now)
  const isMonday = new Date(today + 'T12:00:00Z').getUTCDay() === 1

  // Stuur een herinnering maar één keer per soort en onderwerp.
  async function once(user: typeof users.$inferSelect, kind: string, ref: string, subject: string, text: string) {
    if (!user.email || !user.active) return
    const [row] = await db.insert(reminders).values({ userId: user.id, kind, ref }).onConflictDoNothing().returning()
    if (!row) return
    await sendMail({ email: user.email, name: user.name }, subject, `Hoi ${user.name.split(' ')[0]},\n\n${text}\n\n${appUrl('/')}\n`)
    log.push(`${kind} aan ${user.id}`)
  }

  for (const org of await db.select().from(organisations)) {
    await ensureTalks(org.id)
    const emps = await db.select().from(users).where(and(eq(users.orgId, org.id), eq(users.role, 'medewerker'), eq(users.active, true)))

    // 1. Op maandag: de weekcheck staat klaar.
    if (isMonday) {
      for (const e of emps) {
        await once(e, 'week', `${year}-${week}`, 'Je weekcheck staat klaar', 'Je weekcheck van deze week staat klaar. Het duurt ongeveer twee minuten.')
      }
    }

    for (const e of emps) {
      const open = await db.select().from(talks).where(and(eq(talks.employeeId, e.id), ne(talks.status, 'gevoerd')))
      for (const t of open) {
        const [slot] = await db.select().from(slots).where(eq(slots.talkId, t.id))
        // 2. Uitnodiging zodra een gesprek klaarstaat.
        await once(e, 'uitnodiging', t.id, 'Je gesprek staat klaar', `Je functioneringsgesprek staat klaar: ${t.label}. Kies een moment en begin rustig aan je voorbereiding.`)
        // 3. Een week voor de gespreksweek nog geen moment gekozen.
        if (!slot && t.talkWeekId) {
          const [tw] = await db.select().from(talkWeeks).where(eq(talkWeeks.id, t.talkWeekId))
          if (tw && addDays(mondayOfWeek(tw.year, tw.week), -7) <= today) {
            await once(e, 'geen-moment', t.id, 'Kies nog een moment voor je gesprek', `Je hebt nog geen moment gekozen voor je gesprek in ${t.label.toLowerCase()}. Wil je dat nog doen?`)
          }
        }
        // 4. Drie dagen voor het gesprek de voorbereiding nog niet gedeeld.
        if (slot && !t.sharedAt && slot.startsAt.getTime() - now.getTime() < 3 * 86400000 && slot.startsAt > now) {
          await once(e, 'voorbereiding', t.id, 'Je gesprek is bijna', `Je gesprek is op ${fmtDate(slot.startsAt)} om ${fmtTime(slot.startsAt)} uur. Je voorbereiding is nog niet gedeeld. Wil je er nog even naar kijken?`)
        }
      }
    }

    // 5. Bewaartermijn: alles van wie langer dan de termijn uit dienst is, wordt verwijderd.
    const cutoff = new Date(now.getTime() - org.retentionMonths * 30.44 * 86400000)
    const gone = await db
      .delete(users)
      .where(and(eq(users.orgId, org.id), eq(users.active, false), isNotNull(users.leftAt), lt(users.leftAt, cutoff)))
      .returning({ id: users.id })
    if (gone.length) log.push(`${gone.length} gebruikers verwijderd na bewaartermijn`)
  }

  // Opruimen van verlopen inloggegevens.
  await db.delete(sessions).where(lt(sessions.expiresAt, now))
  await db.delete(loginTokens).where(lt(loginTokens.expiresAt, now))
  await db.delete(loginAttempts).where(lt(loginAttempts.at, new Date(now.getTime() - 86400000)))
  return Response.json({ ok: true, log })
}
