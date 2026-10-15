import 'server-only'

// Verstuurt mail via Brevo. Zonder BREVO_API_KEY (op je laptop) komt de mail in het venster waar de app draait.

export async function sendMail(to: { email: string; name: string }, subject: string, text: string) {
  const key = process.env.BREVO_API_KEY
  if (!key) {
    console.log(`\n[mail] aan ${to.name} <${to.email}>\nOnderwerp: ${subject}\n${text}\n`)
    return
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || 'Gesprekstool' },
      to: [to],
      subject,
      textContent: text,
    }),
  })
  if (!res.ok) throw new Error(`Mail versturen mislukt (${res.status})`)
}

// Zonder APP_URL gebruikt de tool het webadres dat Vercel zelf geeft.
export function appUrl(path = ''): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const base = process.env.APP_URL || (vercel ? `https://${vercel}` : 'http://localhost:3000')
  return base.replace(/\/$/, '') + path
}
