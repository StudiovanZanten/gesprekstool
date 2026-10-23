import Link from 'next/link'
import type { Organisation, User } from '@/db'
import { uitloggen } from '@/app/inloggen/actions'

// Bovenbalk met logo en naam van de organisatie, plus de menu's die bij de rol horen.
export function Kop({ org, user }: { org: Organisation; user: User }) {
  const meeting = user.role === 'beheerder' || user.inMeeting
  const staff = user.role !== 'medewerker'
  return (
    <header className="kop">
      <div className="kop-in">
        <Link href="/" className="merk">
          {org.logoUrl ? <img src={org.logoUrl} alt="" /> : null}
          <span>
            {org.name}
            <span className="merk-sub">Samen Groeien</span>
          </span>
        </Link>
        <nav className="nav" aria-label="Menu">
          {staff ? (
            <>
              <Link href="/beheer">Start</Link>
              <Link href="/beheer/medewerkers">Medewerkers</Link>
              <Link href="/beheer/planning">Planning</Link>
              {meeting && <Link href="/vergaderingen">Overleg</Link>}
              {user.role === 'beheerder' && <Link href="/beheer/instellingen">Instellingen</Link>}
            </>
          ) : (
            <>
              <Link href="/mijn">Start</Link>
              <Link href="/mijn/profiel">Mijn profiel</Link>
              {meeting && <Link href="/vergaderingen">Overleg</Link>}
            </>
          )}
          <form action={uitloggen}>
            <button className="knop licht klein">Uitloggen</button>
          </form>
        </nav>
      </div>
    </header>
  )
}

export function orgStyle(org: Organisation): React.CSSProperties {
  return { ['--hoofd' as string]: org.colorPrimary, ['--accent' as string]: org.colorAccent }
}
