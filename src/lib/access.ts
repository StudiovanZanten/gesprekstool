import 'server-only'
import { and, eq } from 'drizzle-orm'
import { accessLog, db, employeeTypes, users, type User } from '@/db'

// De privacyregels van de tool op één plek.
// Een medewerker ziet alles van zichzelf. Een stagebegeleider ziet gedeelde gegevens van de eigen stagiaires.
// Een beheerder ziet gedeelde gegevens van medewerkers die geen stagiaire zijn.

export async function isIntern(employee: User): Promise<boolean> {
  if (!employee.typeId) return false
  const [t] = await db.select().from(employeeTypes).where(eq(employeeTypes.id, employee.typeId))
  return t?.rhythm === 'stage'
}

export async function canViewEmployee(viewer: User, employee: User): Promise<boolean> {
  if (viewer.orgId !== employee.orgId) return false
  if (viewer.id === employee.id) return true
  if (employee.role !== 'medewerker') return false
  if (employee.supervisorId && employee.supervisorId === viewer.id) return true
  if (viewer.role === 'beheerder') return !(await isIntern(employee))
  return false
}

export async function employeesVisibleTo(viewer: User): Promise<User[]> {
  const all = await db
    .select()
    .from(users)
    .where(and(eq(users.orgId, viewer.orgId), eq(users.role, 'medewerker')))
    .orderBy(users.name)
  const out: User[] = []
  for (const e of all) if (await canViewEmployee(viewer, e)) out.push(e)
  return out
}

export async function loadVisibleEmployee(viewer: User, employeeId: string): Promise<User | null> {
  const [e] = await db.select().from(users).where(and(eq(users.id, employeeId), eq(users.orgId, viewer.orgId)))
  if (!e || !(await canViewEmployee(viewer, e))) return null
  return e
}

export async function logAccess(viewer: User, subjectId: string, what: string) {
  if (viewer.id === subjectId) return
  await db.insert(accessLog).values({ orgId: viewer.orgId, viewerId: viewer.id, subjectId, what })
}
