'use server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { agreements, db, talks, users } from '@/db'
import { canViewEmployee } from '@/lib/access'
import { requireUser } from '@/lib/auth'
import { STATUSSEN } from '@/lib/questions'

// Voortgang van een afspraak aanpassen. Mag de medewerker zelf en wie de medewerker mag zien.
export async function zetVoortgang(id: string, fd: FormData) {
  const me = await requireUser()
  const status = String(fd.get('status') ?? '')
  if (!STATUSSEN[status]) return
  const [row] = await db
    .select({ ag: agreements, emp: users })
    .from(agreements)
    .innerJoin(talks, eq(talks.id, agreements.talkId))
    .innerJoin(users, eq(users.id, talks.employeeId))
    .where(eq(agreements.id, id))
  if (!row || !(await canViewEmployee(me, row.emp))) return
  const done = status === 'gelukt'
  await db.update(agreements).set({ status, done, doneAt: done ? (row.ag.doneAt ?? new Date()) : null }).where(eq(agreements.id, id))
  revalidatePath('/mijn/profiel')
  revalidatePath(`/beheer/medewerkers/${row.emp.id}`)
}
