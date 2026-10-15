'use server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db, users, weekchecks } from '@/db'
import { loadVisibleEmployee } from '@/lib/access'
import { requireStaff } from '@/lib/auth'

export async function hulpOpgepakt(checkId: string) {
  const me = await requireStaff()
  const [c] = await db.select().from(weekchecks).where(eq(weekchecks.id, checkId))
  if (!c || !(await loadVisibleEmployee(me, c.userId))) return
  await db.update(weekchecks).set({ helpHandledAt: new Date() }).where(eq(weekchecks.id, checkId))
  revalidatePath('/beheer')
}
