import 'server-only'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { db, loginAttempts, loginTokens, organisations, sessions, users, type User } from '@/db'
import { hashCode, randomToken, sha256 } from './crypto'

const COOKIE = 'gt_sessie'
const SESSION_DAYS = 30

export async function createSession(userId: string) {
  const token = randomToken()
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000),
  })
  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  })
}

export async function destroySession() {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)))
  jar.delete(COOKIE)
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date()), eq(users.active, true)))
    .limit(1)
  return rows[0]?.user ?? null
}

export async function requireUser(): Promise<User> {
  const user = await currentUser()
  if (!user) redirect('/inloggen')
  return user
}

export async function requireStaff(): Promise<User> {
  const user = await requireUser()
  if (user.role === 'medewerker') redirect('/mijn')
  return user
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser()
  if (user.role !== 'beheerder') redirect(user.role === 'begeleider' ? '/beheer' : '/mijn')
  return user
}

export async function getOrg(orgId: string) {
  const [org] = await db.select().from(organisations).where(eq(organisations.id, orgId))
  return org
}

// Eenvoudige rem op raden: maximaal 10 pogingen per kwartier per adres.
export async function tooManyAttempts(kind: string): Promise<boolean> {
  const h = await headers()
  const ip = (h.get('x-forwarded-for') || 'onbekend').split(',')[0].trim()
  const key = `${kind}:${sha256(ip)}`
  const since = new Date(Date.now() - 15 * 60000)
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gt(loginAttempts.at, since)))
  await db.insert(loginAttempts).values({ key })
  return n >= 10
}

export async function createLoginToken(userId: string): Promise<string> {
  const token = randomToken()
  await db.insert(loginTokens).values({
    userId,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 15 * 60000),
  })
  return token
}

export async function consumeLoginToken(token: string): Promise<string | null> {
  const [row] = await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(
      and(eq(loginTokens.tokenHash, sha256(token)), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date())),
    )
    .returning({ userId: loginTokens.userId })
  return row?.userId ?? null
}

export async function userByCode(code: string): Promise<User | null> {
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.loginCodeHash, hashCode(code)), eq(users.active, true)))
  return u ?? null
}
