'use server'
import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, talks, users } from '@/db'
import { canViewEmployee } from '@/lib/access'
import { requireUser } from '@/lib/auth'
import { encrypt } from '@/lib/crypto'

// Bevestigen dat het verslag ontvangen en gelezen is. Dat is geen akkoord.
export async function bevestigVerslag(talkId: string, fd: FormData) {
  const me = await requireUser()
  const [talk] = await db.select().from(talks).where(and(eq(talks.id, talkId), eq(talks.orgId, me.orgId)))
  if (!talk || talk.status !== 'gevoerd') redirect('/')
  if (talk.employeeId === me.id) {
    const reaction = String(fd.get('reactie') ?? '').trim().slice(0, 5000)
    await db
      .update(talks)
      .set({ employeeConfirmedAt: talk.employeeConfirmedAt ?? new Date(), employeeReactionEnc: encrypt(reaction) })
      .where(eq(talks.id, talkId))
  } else {
    const [emp] = await db.select().from(users).where(eq(users.id, talk.employeeId))
    if (!emp || me.role === 'medewerker' || !(await canViewEmployee(me, emp))) redirect('/')
    if (!talk.hostConfirmedAt) await db.update(talks).set({ hostConfirmedAt: new Date(), hostConfirmedBy: me.id }).where(eq(talks.id, talkId))
  }
  redirect(`/verslag/${talkId}?melding=bevestigd`)
}
