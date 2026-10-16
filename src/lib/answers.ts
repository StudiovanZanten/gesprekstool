import 'server-only'
import { and, eq } from 'drizzle-orm'
import { answers, db, type Question } from '@/db'
import { encrypt } from './crypto'
import { ANDERS, optionsOf } from './questions'

// Slaat de antwoorden uit een vragenformulier op. De vraagtekst wordt meebewaard,
// zodat oude antwoorden kloppen als de vraag later wordt aangepast.
export async function saveAnswers(opts: {
  orgId: string
  userId: string
  talkId?: string
  weekcheckId?: string
  questions: Question[]
  fd: FormData
  shareHelp?: boolean
}) {
  const { orgId, userId, talkId, weekcheckId, questions, fd } = opts
  for (const q of questions) {
    let value = String(fd.get(`a-${q.id}`) ?? '').trim().slice(0, 5000)
    let note = String(fd.get(`n-${q.id}`) ?? '').trim().slice(0, 5000)
    if (q.answerType === 'keuze') {
      // Alleen een bestaande keuze telt. Bij "Anders" hoort de eigen tekst.
      if (value !== ANDERS && !optionsOf(q).includes(value)) value = ''
      if (value !== ANDERS) note = ''
    }
    const sRaw = Number(fd.get(`s-${q.id}`))
    const smiley = sRaw >= 1 && sRaw <= 5 ? sRaw : null
    const target = talkId ? eq(answers.talkId, talkId) : eq(answers.weekcheckId, weekcheckId!)
    const [existing] = await db.select().from(answers).where(and(target, eq(answers.questionId, q.id)))
    const empty = !value && !note && smiley == null
    if (empty && !existing) continue
    const share = q.helpSignal && opts.shareHelp ? true : undefined
    const data = {
      questionText: q.text,
      answerType: q.answerType,
      position: q.position,
      valueEnc: encrypt(value),
      noteEnc: encrypt(note),
      smiley,
      updatedAt: new Date(),
    }
    if (existing) {
      await db.update(answers).set({ ...data, ...(share ? { shared: true } : {}) }).where(eq(answers.id, existing.id))
    } else {
      await db.insert(answers).values({ ...data, orgId, userId, talkId, weekcheckId, questionId: q.id, shared: !!share })
    }
  }
}
