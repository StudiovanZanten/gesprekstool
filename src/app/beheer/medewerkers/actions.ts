'use server'
import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, employeeTypes, organisations, sessions, talks, users, type User } from '@/db'
import { loadVisibleEmployee } from '@/lib/access'
import { createLoginToken, requireAdmin, requireStaff } from '@/lib/auth'
import { appUrl, sendMail } from '@/lib/mail'
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

const WELKOM_DAGEN = 3

// Welkomstmail met een inloglink die een paar dagen werkt. Geeft false terug als het versturen mislukt.
async function mailWelkom(u: User): Promise<boolean> {
  if (!u.email) return false
  const [org] = await db.select().from(organisations).where(eq(organisations.id, u.orgId))
  const token = await createLoginToken(u.id, WELKOM_DAGEN * 24 * 60)
  try {
    await sendMail(
      { email: u.email, name: u.name },
      `Welkom bij de gesprekstool van ${org.name}`,
      `Hoi ${u.name.split(' ')[0]},\n\n${org.name} gebruikt deze tool om je voor te bereiden op je gesprekken en om elke week even terug te kijken.\n\nTik op deze link om in te loggen. De link werkt ${WELKOM_DAGEN} dagen en maar één keer.\n\n${appUrl(`/inloggen/link?t=${token}`)}\n\nDaarna kun je altijd weer inloggen via ${appUrl('/inloggen')} met dit mailadres.`,
    )
    return true
  } catch {
    return false
  }
}

export async function voegToe(fd: FormData) {
  const me = await requireAdmin()
  const data = await readForm(me.orgId, fd)
  if (!data.name) redirect('/beheer/medewerkers?melding=naam')
  let u: User
  try {
    ;[u] = await db.insert(users).values({ ...data, orgId: me.orgId }).returning()
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) redirect('/beheer/medewerkers?melding=dubbel')
    throw e
  }
  const melding = !u.email ? 'nieuw' : (await mailWelkom(u)) ? 'nieuw-gemaild' : 'mailfout'
  redirect(`/beheer/medewerkers/${u.id}?melding=${melding}`)
}

export async function stuurUitnodiging(id: string) {
  const me = await requireAdmin()
  const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, me.orgId), eq(users.active, true)))
  if (!u) redirect('/beheer/medewerkers')
  const ok = await mailWelkom(u)
  redirect(`/beheer/medewerkers/${id}?melding=${ok ? 'uitgenodigd' : 'mailfout'}`)
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
