import Link from 'next/link'
import { inloggenMetCode, vraagLinkAan } from './actions'

const MELDINGEN: Record<string, [string, string]> = {
  verstuurd: ['goed', 'Als dit mailadres bij ons bekend is, staat er nu een mail met een inloglink voor je klaar. Kijk ook even bij ongewenste mail.'],
  verlopen: ['fout', 'Deze inloglink werkt niet meer. Vraag hieronder een nieuwe aan.'],
  foutecode: ['fout', 'Deze code klopt niet. Kijk goed of je hem goed hebt overgenomen.'],
  teveel: ['fout', 'Te veel pogingen. Probeer het over een kwartier opnieuw.'],
}

export default async function Inloggen({ searchParams }: { searchParams: Promise<{ melding?: string; code?: string }> }) {
  const sp = await searchParams
  const melding = sp.melding ? MELDINGEN[sp.melding] : null
  const metCode = sp.code === '1'
  return (
    <main className="smal">
      <h1>Inloggen</h1>
      {melding && <div className={`melding ${melding[0]}`}>{melding[1]}</div>}
      {metCode ? (
        <form action={inloggenMetCode} className="kaart">
          <div className="veld">
            <label htmlFor="code">Jouw inlogcode</label>
            <input id="code" name="code" type="text" autoComplete="off" autoCapitalize="characters" required />
          </div>
          <button className="knop">Inloggen</button>
          <Link href="/inloggen" className="klein">Ik log liever in met mijn mailadres</Link>
        </form>
      ) : (
        <form action={vraagLinkAan} className="kaart">
          <p>Vul je mailadres in. Je krijgt een mail met een link. Tik op die link en je bent binnen.</p>
          <div className="veld">
            <label htmlFor="email">Je mailadres</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <button className="knop">Stuur mij een inloglink</button>
          <Link href="/inloggen?code=1" className="klein">Ik heb een inlogcode gekregen</Link>
        </form>
      )}
      <p className="zacht klein">
        <Link href="/privacy">Zo gaan we om met je gegevens</Link>
      </p>
    </main>
  )
}
