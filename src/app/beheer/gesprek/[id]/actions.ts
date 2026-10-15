'use server'
import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { agreements, db, talks } from '@/db'
import { loadVisibleEmployee } from '@/lib/access'
import { requireStaff } from '@/lib/auth'
import { encrypt } from '@/lib/crypto'
import { lastHeldTalk } from '@/lib/talks'

async function load(talkId: string) {
  const me = await requireStaff()
  const [talk] = await db.select().from(talks).where(and(eq(talks.id, talkId), eq(talks.orgId, me.orgId)))
  if (!talk || !(await loadVisibleEmployee(me, talk.employeeId))) redirect('/beheer')
  return { me, talk }
}

export async function bewaarVerslag(talkId: string, fd: FormData) {
  const { talk } = await load(talkId)
  if (talk.status === 'gevoerd') redirect(`/beheer/gesprek/${talkId}`)
  const afronden = fd.get('afronden') === '1'
  const prev = await lastHeldTalk(talk.employeeId)
  await db
    .update(talks)
    .set({
      goodEnc: encrypt(String(fd.get('goed') ?? '').trim()),
      attentionEnc: encrypt(String(fd.get('aandacht') ?? '').trim()),
      ...(afronden ? { status: 'gevoerd' as const, heldAt: new Date() } : {}),
    })
    .where(eq(talks.id, talkId))
  await db.delete(agreements).where(eq(agreements.talkId, talkId))
  for (let i = 0; i < 3; i++) {
    const text = String(fd.get(`afspraak-${i}`) ?? '').trim().slice(0, 1000)
    const date = String(fd.get(`datum-${i}`) ?? '')
    if (text) {
      await db.insert(agreements).values({
        talkId,
        textEnc: encrypt(text)!,
        reviewDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      })
    }
  }
  // Vorige afspraken: gelukt of niet.
  if (prev && prev.id !== talkId) {
    const prevAg = await db.select().from(agreements).where(eq(agreements.talkId, prev.id))
    const done = new Set(fd.getAll('gelukt').map(String))
    for (const a of prevAg) await db.update(agreements).set({ done: done.has(a.id) }).where(eq(agreements.id, a.id))
  }
  redirect(`/beheer/gesprek/${talkId}?melding=${afronden ? 'afgerond' : 'bewaard'}`)
}
