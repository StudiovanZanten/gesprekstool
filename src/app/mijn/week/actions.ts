'use server'
import { and, eq, inArray } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { answers, db, organisations, users, weekchecks } from '@/db'
import { saveAnswers } from '@/lib/answers'
import { requireUser } from '@/lib/auth'
import { isoWeek } from '@/lib/dates'
import { appUrl, sendMail } from '@/lib/mail'
import { activeQuestions } from '@/lib/talks'
import { isIntern } from '@/lib/access'

export async function bewaarWeekcheck(fd: FormData) {
  const user = await requireUser()
  const [org] = await db.select().from(organisations).where(eq(organisations.id, user.orgId))
  const qs = await activeQuestions(org.weeklyQuestionnaireId)
  const { year, week } = isoWeek(new Date())
  const help = fd.get('hulp') === 'on'
  await db
    .insert(weekchecks)
    .values({ orgId: user.orgId, userId: user.id, year, week })
    .onConflictDoNothing()
  const [check] = await db
    .select()
    .from(weekchecks)
    .where(and(eq(weekchecks.userId, user.id), eq(weekchecks.year, year), eq(weekchecks.week, week)))
  await saveAnswers({ orgId: user.orgId, userId: user.id, weekcheckId: check.id, questions: qs, fd, shareHelp: help })
  // Standaard gedeeld. Zet de medewerker het uit, dan blijft alles privé (behalve een hulpvraag).
  const share = fd.get('delen') === 'on'
  await db.update(weekchecks).set({ shared: share }).where(eq(weekchecks.id, check.id))
  await db.update(answers).set({ shared: share }).where(and(eq(answers.weekcheckId, check.id), eq(answers.userId, user.id)))
  if (help && !share) {
    const helpIds = qs.filter((q) => q.helpSignal).map((q) => q.id)
    if (helpIds.length) await db.update(answers).set({ shared: true }).where(and(eq(answers.weekcheckId, check.id), inArray(answers.questionId, helpIds)))
  }
  if (help && !check.helpRequested) {
    await db.update(weekchecks).set({ helpRequested: true, helpHandledAt: null }).where(eq(weekchecks.id, check.id))
    // Seintje aan de stagebegeleider (stagiaires) of aan de beheerders. Zonder inhoud in de mail.
    const to = (await isIntern(user)) && user.supervisorId
      ? await db.select().from(users).where(eq(users.id, user.supervisorId))
      : await db.select().from(users).where(and(eq(users.orgId, user.orgId), eq(users.role, 'beheerder'), eq(users.active, true)))
    for (const r of to) {
      if (r.email) {
        await sendMail(
          { email: r.email, name: r.name },
          `${user.name} vraagt om hulp`,
          `Hoi ${r.name},\n\n${user.name} heeft in de weekcheck aangegeven graag hulp te krijgen. Je leest het antwoord na het inloggen op je startscherm.\n\n${appUrl('/beheer')}`,
        )
      }
    }
  }
  redirect(fd.get('later') ? '/mijn' : '/mijn/week?klaar=1')
}
