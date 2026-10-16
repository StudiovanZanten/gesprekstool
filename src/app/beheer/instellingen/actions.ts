'use server'
import { and, eq, max } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, employeeTypes, organisations, questionnaires, questions } from '@/db'
import { requireAdmin } from '@/lib/auth'

const color = (v: FormDataEntryValue | null, fallback: string) => (/^#[0-9a-fA-F]{6}$/.test(String(v)) ? String(v) : fallback)
const int = (v: FormDataEntryValue | null, min: number, maxV: number, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= min && n <= maxV ? Math.round(n) : fallback
}

export async function bewaarOrganisatie(fd: FormData) {
  const me = await requireAdmin()
  const [org] = await db.select().from(organisations).where(eq(organisations.id, me.orgId))
  const logo = String(fd.get('logo') ?? '').trim()
  await db
    .update(organisations)
    .set({
      name: String(fd.get('naam') ?? '').trim() || org.name,
      logoUrl: /^https:\/\//.test(logo) ? logo : null,
      colorPrimary: color(fd.get('kleur_hoofd'), org.colorPrimary),
      colorAccent: color(fd.get('kleur_accent'), org.colorAccent),
      talkMinutes: int(fd.get('duur'), 10, 240, org.talkMinutes),
      retentionMonths: int(fd.get('bewaar'), 1, 120, org.retentionMonths),
      onePerDay: fd.get('perdag') === 'on',
    })
    .where(eq(organisations.id, me.orgId))
  redirect('/beheer/instellingen?melding=bewaard')
}

const soort = (v: FormDataEntryValue | null) => (v === 'smiley' || v === 'keuze' ? v : 'tekst')
const onderdeel = (v: FormDataEntryValue | null) => (v === 'A' || v === 'B' || v === 'C' ? v : null)
// Keuzes: één per regel, hooguit zes. "Anders" komt er vanzelf bij.
function keuzes(v: FormDataEntryValue | null): string | null {
  const list = String(v ?? '')
    .split('\n')
    .map((x) => x.trim().slice(0, 300))
    .filter((x) => x && !/^anders\b/i.test(x))
    .slice(0, 6)
  return list.length ? JSON.stringify(list) : null
}

async function ownList(questionnaireId: string, orgId: string) {
  const [q] = await db.select().from(questionnaires).where(and(eq(questionnaires.id, questionnaireId), eq(questionnaires.orgId, orgId)))
  if (!q) redirect('/beheer/instellingen')
  return q
}

export async function bewaarVraag(id: string, fd: FormData) {
  const me = await requireAdmin()
  const [q] = await db.select().from(questions).where(eq(questions.id, id))
  if (!q) redirect('/beheer/instellingen')
  await ownList(q.questionnaireId, me.orgId)
  const type = soort(fd.get('soort'))
  await db
    .update(questions)
    .set({
      text: String(fd.get('tekst') ?? '').trim() || q.text,
      topic: String(fd.get('onderwerp') ?? '').trim() || null,
      answerType: type,
      section: onderdeel(fd.get('onderdeel')),
      options: type === 'keuze' ? keuzes(fd.get('keuzes')) : null,
      allowNote: type === 'smiley',
      position: int(fd.get('volgorde'), 1, 999, q.position),
      active: fd.get('actief') === 'on',
      isGoal: fd.get('doel') === 'on',
    })
    .where(eq(questions.id, id))
  redirect(`/beheer/instellingen?lijst=${q.questionnaireId}&melding=vraag`)
}

export async function nieuweVraag(questionnaireId: string, fd: FormData) {
  const me = await requireAdmin()
  await ownList(questionnaireId, me.orgId)
  const text = String(fd.get('tekst') ?? '').trim()
  if (!text) redirect(`/beheer/instellingen?lijst=${questionnaireId}`)
  const [{ m }] = await db.select({ m: max(questions.position) }).from(questions).where(eq(questions.questionnaireId, questionnaireId))
  const type = soort(fd.get('soort'))
  await db.insert(questions).values({
    questionnaireId,
    text,
    topic: String(fd.get('onderwerp') ?? '').trim() || null,
    answerType: type,
    section: onderdeel(fd.get('onderdeel')),
    options: type === 'keuze' ? keuzes(fd.get('keuzes')) : null,
    allowNote: type === 'smiley',
    position: (m ?? 0) + 1,
  })
  redirect(`/beheer/instellingen?lijst=${questionnaireId}&melding=vraag`)
}

export async function bewaarType(id: string, fd: FormData) {
  const me = await requireAdmin()
  const name = String(fd.get('naam') ?? '').trim()
  if (name) await db.update(employeeTypes).set({ name }).where(and(eq(employeeTypes.id, id), eq(employeeTypes.orgId, me.orgId)))
  redirect('/beheer/instellingen?melding=bewaard')
}

export async function nieuwType(fd: FormData) {
  const me = await requireAdmin()
  const name = String(fd.get('naam') ?? '').trim()
  if (!name) redirect('/beheer/instellingen')
  const rhythm = fd.get('ritme') === 'stage' ? 'stage' : 'weken'
  const [ql] = await db.insert(questionnaires).values({ orgId: me.orgId, name, kind: 'gesprek' }).returning()
  const [{ m }] = await db.select({ m: max(employeeTypes.position) }).from(employeeTypes).where(eq(employeeTypes.orgId, me.orgId))
  await db.insert(employeeTypes).values({ orgId: me.orgId, name, rhythm, questionnaireId: ql.id, position: (m ?? 0) + 1 })
  redirect(`/beheer/instellingen?lijst=${ql.id}&melding=type`)
}
