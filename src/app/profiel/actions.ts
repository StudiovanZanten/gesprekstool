'use server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { agreements, db, talks, users } from '@/db'
import { canViewEmployee } from '@/lib/access'
import { requireUser } from '@/lib/auth'

// Afspraak afvinken als gelukt (of weer open zetten). Mag de medewerker zelf en wie de medewerker mag zien.
export async function wisselAfspraak(id: string) {
  const me = await requireUser()
  const [row] = await db
    .select({ ag: agreements, emp: users })
    .from(agreements)
    .innerJoin(talks, eq(talks.id, agreements.talkId))
    .innerJoin(users, eq(users.id, talks.employeeId))
    .where(eq(agreements.id, id))
  if (!row || !(await canViewEmployee(me, row.emp))) return
  const done = !row.ag.done
  await db.update(agreements).set({ done, doneAt: done ? new Date() : null }).where(eq(agreements.id, id))
  revalidatePath('/mijn/profiel')
  revalidatePath(`/beheer/medewerkers/${row.emp.id}`)
}
