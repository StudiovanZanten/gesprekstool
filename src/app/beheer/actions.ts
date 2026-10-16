'use server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db, users, weekchecks } from '@/db'
import { loadVisibleEmployee } from '@/lib/access'
import { requireStaff } from '@/lib/auth'

export async function hulpOpgepakt(checkId: string, backToStart = false) {
  const me = await requireStaff()
  const [c] = await db.select().from(weekchecks).where(eq(weekchecks.id, checkId))
  if (!c || !(await loadVisibleEmployee(me, c.userId))) return
  await db.update(weekchecks).set({ helpHandledAt: new Date(), helpHandledBy: me.id }).where(eq(weekchecks.id, checkId))
  revalidatePath('/beheer')
  if (backToStart) redirect('/beheer')
}
