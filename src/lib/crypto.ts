import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'

// Versleuteling van vrije tekst (antwoorden, toelichtingen, afspraken) met AES-256-GCM.
// De sleutel staat alleen in de omgevingsvariabele ENCRYPTION_KEY, nooit in de database.

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY ontbreekt')
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY moet 32 bytes (base64) zijn')
  return buf
}

export function encrypt(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return null
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':')
}

export function decrypt(value: string | null | undefined): string {
  if (!value) return ''
  const [v, iv, tag, ct] = value.split(':')
  if (v !== 'v1') throw new Error('Onbekende versleuteling')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

// Inlogcodes worden gehasht met een geheim, zodat een gelekte database de codes niet prijsgeeft.
export function hashCode(code: string): string {
  const secret = process.env.APP_SECRET
  if (!secret) throw new Error('APP_SECRET ontbreekt')
  return createHmac('sha256', secret).update(normaliseCode(code)).digest('hex')
}

export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function newLoginCode(): string {
  const bytes = randomBytes(10)
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
  return `${chars.slice(0, 5)} ${chars.slice(5)}`
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url')
}
