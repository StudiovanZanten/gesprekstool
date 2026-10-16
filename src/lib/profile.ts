import 'server-only'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { agreements, answers, db, questions, slots, talks } from '@/db'
import { decrypt } from './crypto'

// Alles voor het profiel van één medewerker. Met onlyShared=true (voor leidinggevende en stagebegeleider)
// komen alleen gedeelde antwoorden mee. Afspraken en verslagen zijn voor beide kanten zichtbaar.
export async function profileData(employeeId: string, onlyShared: boolean) {
  const held = await db
    .select({ talk: talks, slot: slots })
    .from(talks)
    .leftJoin(slots, eq(slots.talkId, talks.id))
    .where(and(eq(talks.employeeId, employeeId), eq(talks.status, 'gevoerd')))
    .orderBy(desc(talks.heldAt))
  const talkIds = held.map((h) => h.talk.id)
  const ags = talkIds.length
    ? await db.select().from(agreements).where(inArray(agreements.talkId, talkIds)).orderBy(asc(agreements.reviewDate))
    : []
  const allAgreements = ags.map((a) => ({
    ...a,
    text: decrypt(a.textEnc),
    talkLabel: held.find((h) => h.talk.id === a.talkId)?.talk.label ?? '',
  }))

  // Doelen: antwoorden op doelvragen uit het laatste gevoerde gesprek.
  let goals: { question: string; answer: string }[] = []
  if (held[0]) {
    const conds = [eq(answers.talkId, held[0].talk.id), eq(questions.isGoal, true)]
    if (onlyShared) conds.push(eq(answers.shared, true))
    const rows = await db
      .select({ a: answers })
      .from(answers)
      .innerJoin(questions, eq(questions.id, answers.questionId))
      .where(and(...conds))
      .orderBy(asc(answers.position))
    goals = rows.map(({ a }) => ({ question: a.questionText, answer: decrypt(a.valueEnc) })).filter((g) => g.answer)
  }

  return {
    devGoals: held[0] ? decrypt(held[0].talk.goalsEnc) : '',
    open: allAgreements.filter((a) => !a.done),
    done: allAgreements.filter((a) => a.done),
    goals,
    held: held.map(({ talk, slot }) => ({
      ...talk,
      date: slot?.startsAt ?? talk.heldAt,
      good: decrypt(talk.goodEnc),
      attention: decrypt(talk.attentionEnc),
      agreements: allAgreements.filter((a) => a.talkId === talk.id),
    })),
  }
}
