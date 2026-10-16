'use server'
import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { agreements, db, talks, users } from '@/db'
import { loadVisibleEmployee } from '@/lib/access'
import { requireStaff } from '@/lib/auth'
import { encrypt } from '@/lib/crypto'
import { appUrl, sendMail } from '@/lib/mail'
import { EIGENAREN, STATUSSEN, VOORBEREIDING_LEIDING } from '@/lib/questions'
import { lastHeldTalk } from '@/lib/talks'

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)
const txt = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim().slice(0, 5000)

async function load(talkId: string) {
  const me = await requireStaff()
  const [talk] = await db.select().from(talks).where(and(eq(talks.id, talkId), eq(talks.orgId, me.orgId)))
  if (!talk || !(await loadVisibleEmployee(me, talk.employeeId))) redirect('/beheer')
  return { me, talk }
}


// Voorbereiding van de leidinggevende. Wordt nooit aan de medewerker getoond.
export async function bewaarVoorbereidingLeiding(talkId: string, fd: FormData) {
  await load(talkId)
  const data = Object.fromEntries(VOORBEREIDING_LEIDING.map((v) => [v.key, txt(fd, v.key)]))
  await db.update(talks).set({ hostPrepEnc: encrypt(JSON.stringify(data)) }).where(eq(talks.id, talkId))
  redirect(`/beheer/gesprek/${talkId}?melding=voorbereid#voorbereiding`)
}

export async function bewaarVerslag(talkId: string, fd: FormData) {
  const { me, talk } = await load(talkId)
  if (talk.status === 'gevoerd') redirect(`/beheer/gesprek/${talkId}`)
  const afronden = fd.get('afronden') === '1'
  const prev = await lastHeldTalk(talk.employeeId)
  const next = String(fd.get('volgend') ?? '')
  await db
    .update(talks)
    .set({
      topicsEnc: encrypt(txt(fd, 'onderwerpen')),
      goodEnc: encrypt(txt(fd, 'goed')),
      attentionEnc: encrypt(txt(fd, 'aandacht')),
      goalsEnc: encrypt(txt(fd, 'doelen')),
      nextTalkDate: isDate(next) ? next : null,
      ...(afronden ? { status: 'gevoerd' as const, heldAt: new Date(), reportById: me.id } : {}),
    })
    .where(eq(talks.id, talkId))
  await db.delete(agreements).where(eq(agreements.talkId, talkId))
  for (let i = 0; i < 3; i++) {
    const text = String(fd.get(`afspraak-${i}`) ?? '').trim().slice(0, 1000)
    const date = String(fd.get(`datum-${i}`) ?? '')
    const owner = String(fd.get(`wie-${i}`) ?? '')
    const status = String(fd.get(`status-${i}`) ?? '')
    const st = STATUSSEN[status] ? status : 'nog_niet'
    if (text) {
      await db.insert(agreements).values({
        talkId,
        textEnc: encrypt(text)!,
        reviewDate: isDate(date) ? date : null,
        owner: EIGENAREN[owner] ? owner : null,
        status: st,
        done: st === 'gelukt',
        doneAt: st === 'gelukt' ? new Date() : null,
      })
    }
  }
  // Voortgang van de vorige afspraken.
  if (prev && prev.id !== talkId) {
    const prevAg = await db.select().from(agreements).where(eq(agreements.talkId, prev.id))
    for (const a of prevAg) {
      const st = String(fd.get(`vorig-${a.id}`) ?? '')
      if (STATUSSEN[st] && st !== a.status) {
        await db.update(agreements).set({ status: st, done: st === 'gelukt', doneAt: st === 'gelukt' ? new Date() : null }).where(eq(agreements.id, a.id))
      }
    }
  }
  if (afronden) {
    const [emp] = await db.select().from(users).where(eq(users.id, talk.employeeId))
    if (emp?.email) {
      await sendMail(
        { email: emp.email, name: emp.name },
        'Het verslag van je Samen Groeien gesprek staat klaar',
        `Hoi ${emp.name.split(' ')[0]},\n\nHet verslag van je gesprek staat klaar. Lees het rustig door en laat weten dat je het gelezen hebt. Dat betekent niet dat je het overal mee eens bent. Je kunt er ook een reactie bij zetten.\n\n${appUrl(`/verslag/${talkId}`)}\n`,
      )
    }
  }
  redirect(afronden ? `/verslag/${talkId}?melding=afgerond` : `/beheer/gesprek/${talkId}?melding=bewaard`)
}
