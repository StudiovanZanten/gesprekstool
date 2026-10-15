'use server'
import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, employeeTypes, sessions, talks, users } from '@/db'
import { loadVisibleEmployee } from '@/lib/access'
import { requireAdmin, requireStaff } from '@/lib/auth'
import { hashCode, newLoginCode } from '@/lib/crypto'

type Role = 'beheerder' | 'begeleider' | 'medewerker'

async function readForm(orgId: string, fd: FormData) {
  const name = String(fd.get('naam') ?? '').trim()
  const email = String(fd.get('email') ?? '').toLowerCase().trim() || null
  const role = String(fd.get('rol') ?? 'medewerker') as Role
  if (!['beheerder', 'begeleider', 'medewerker'].includes(role)) throw new Error('Onbekende rol')
  let typeId: string | null = String(fd.get('type') ?? '') || null
  let supervisorId: string | null = String(fd.get('begeleider') ?? '') || null
  if (role !== 'medewerker') {
    typeId = null
    supervisorId = null
  }
  if (typeId) {
    const [t] = await db.select().from(employeeTypes).where(and(eq(employeeTypes.id, typeId), eq(employeeTypes.orgId, orgId)))
    if (!t) typeId = null
    if (t?.rhythm !== 'stage') supervisorId = null
  }
  if (supervisorId) {
    const [s] = await db.select().from(users).where(and(eq(users.id, supervisorId), eq(users.orgId, orgId)))
    if (!s || s.role === 'medewerker') supervisorId = null
  }
  const d = (k: string) => {
    const v = String(fd.get(k) ?? '')
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
  }
  return { name, email, role, typeId, supervisorId, internshipStart: d('stage_start'), internshipEnd: d('stage_einde') }
}

export async function voegToe(fd: FormData) {
  const me = await requireAdmin()
  const data = await readForm(me.orgId, fd)
  if (!data.name) redirect('/beheer/medewerkers?melding=naam')
  try {
    const [u] = await db.insert(users).values({ ...data, orgId: me.orgId }).returning()
    redirect(`/beheer/medewerkers/${u.id}?melding=nieuw`)
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) redirect('/beheer/medewerkers?melding=dubbel')
    throw e
  }
}

export async function bewerk(id: string, fd: FormData) {
  const me = await requireAdmin()
  const data = await readForm(me.orgId, fd)
  if (!data.name) redirect(`/beheer/medewerkers/${id}?melding=naam`)
  if (id === me.id) data.role = 'beheerder'
  try {
    await db.update(users).set(data).where(and(eq(users.id, id), eq(users.orgId, me.orgId)))
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) redirect(`/beheer/medewerkers/${id}?melding=dubbel`)
    throw e
  }
  redirect(`/beheer/medewerkers/${id}?melding=bewaard`)
}

export async function maakCode(id: string, _prev: string | null): Promise<string | null> {
  const me = await requireAdmin()
  const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, me.orgId)))
  if (!u) return null
  const code = newLoginCode()
  await db.update(users).set({ loginCodeHash: hashCode(code) }).where(eq(users.id, id))
  return code
}

export async function uitDienst(id: string) {
  const me = await requireAdmin()
  if (id === me.id) redirect(`/beheer/medewerkers/${id}`)
  await db
    .update(users)
    .set({ active: false, leftAt: new Date(), loginCodeHash: null })
    .where(and(eq(users.id, id), eq(users.orgId, me.orgId)))
  await db.delete(sessions).where(eq(sessions.userId, id))
  redirect(`/beheer/medewerkers/${id}?melding=uitdienst`)
}

export async function weerActief(id: string) {
  const me = await requireAdmin()
  await db.update(users).set({ active: true, leftAt: null }).where(and(eq(users.id, id), eq(users.orgId, me.orgId)))
  redirect(`/beheer/medewerkers/${id}`)
}

// Voor stagiaires: de stagebegeleider zet zelf een gesprek klaar (start, halverwege, einde).
export async function gesprekKlaarzetten(id: string, fd: FormData) {
  const me = await requireStaff()
  const emp = await loadVisibleEmployee(me, id)
  if (!emp || emp.supervisorId !== me.id) redirect(`/beheer/medewerkers/${id}`)
  const label = String(fd.get('moment') ?? 'Gesprek').slice(0, 80)
  await db.insert(talks).values({ orgId: me.orgId, employeeId: id, label, hostId: me.id })
  redirect(`/beheer/medewerkers/${id}?melding=klaargezet`)
}
