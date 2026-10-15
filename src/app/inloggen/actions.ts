'use server'
import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, users } from '@/db'
import {
  consumeLoginToken,
  createLoginToken,
  createSession,
  destroySession,
  tooManyAttempts,
  userByCode,
} from '@/lib/auth'
import { appUrl, sendMail } from '@/lib/mail'

export async function vraagLinkAan(fd: FormData) {
  const email = String(fd.get('email') ?? '').toLowerCase().trim()
  if (await tooManyAttempts('link')) redirect('/inloggen?melding=teveel')
  if (email) {
    const [u] = await db.select().from(users).where(and(eq(users.email, email), eq(users.active, true)))
    if (u) {
      const token = await createLoginToken(u.id)
      await sendMail(
        { email, name: u.name },
        'Je inloglink',
        `Hoi ${u.name},\n\nTik op deze link om in te loggen. De link werkt 15 minuten en maar één keer.\n\n${appUrl(`/inloggen/link?t=${token}`)}\n\nHeb je dit niet zelf gevraagd? Dan kun je deze mail negeren.`,
      )
    }
  }
  // Altijd dezelfde melding, zodat niemand kan uitzoeken welke mailadressen bekend zijn.
  redirect('/inloggen?melding=verstuurd')
}

export async function inloggenMetLink(fd: FormData) {
  const token = String(fd.get('t') ?? '')
  const userId = token ? await consumeLoginToken(token) : null
  if (!userId) redirect('/inloggen?melding=verlopen')
  await createSession(userId)
  redirect('/')
}

export async function inloggenMetCode(fd: FormData) {
  const code = String(fd.get('code') ?? '')
  if (await tooManyAttempts('code')) redirect('/inloggen?melding=teveel&code=1')
  const u = code ? await userByCode(code) : null
  if (!u) redirect('/inloggen?melding=foutecode&code=1')
  await createSession(u.id)
  redirect('/')
}

export async function uitloggen() {
  await destroySession()
  redirect('/inloggen')
}
