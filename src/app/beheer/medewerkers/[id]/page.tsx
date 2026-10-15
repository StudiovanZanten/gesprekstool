import Link from 'next/link'
import { and, asc, desc, eq, ne } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { accessLog, db, employeeTypes, slots, talks, users } from '@/db'
import { CodeKnop } from '@/components/CodeKnop'
import { MedewerkerVelden } from '@/components/MedewerkerVelden'
import { canViewEmployee } from '@/lib/access'
import { requireStaff } from '@/lib/auth'
import { fmtDateLong } from '@/lib/dates'
import { bewerk, gesprekKlaarzetten, maakCode, uitDienst, weerActief } from '../actions'

const STATUS: Record<string, string> = { open: 'Nog geen moment', gepland: 'Ingepland', gedeeld: 'Voorbereiding gedeeld', gevoerd: 'Gevoerd' }
const MELDING: Record<string, string> = {
  nieuw: 'Toegevoegd. Maak hieronder een inlogcode, of laat de medewerker inloggen met het mailadres.',
  bewaard: 'Bewaard.',
  uitdienst: 'Uit dienst gezet. Inloggen kan niet meer. Na de bewaartermijn worden de gegevens automatisch verwijderd.',
  klaargezet: 'Het gesprek staat klaar. Zet bij Planning momenten open, dan kan de stagiaire kiezen.',
  dubbel: 'Dit mailadres is al in gebruik.',
}

export default async function Medewerker({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ melding?: string }> }) {
  const { id } = await params
  const { melding } = await searchParams
  const me = await requireStaff()
  const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, me.orgId)))
  if (!u) notFound()
  const isAdmin = me.role === 'beheerder'
  const canView = await canViewEmployee(me, u)
  if (!isAdmin && !canView) notFound()

  const types = await db.select().from(employeeTypes).where(eq(employeeTypes.orgId, me.orgId)).orderBy(asc(employeeTypes.position))
  const begeleiders = await db.select().from(users).where(and(eq(users.orgId, me.orgId), ne(users.role, 'medewerker'), eq(users.active, true)))
  const type = types.find((t) => t.id === u.typeId)
  const list = canView && u.role === 'medewerker'
    ? await db.select({ talk: talks, slot: slots }).from(talks).leftJoin(slots, eq(slots.talkId, talks.id)).where(eq(talks.employeeId, u.id)).orderBy(desc(talks.createdAt))
    : []
  const log = isAdmin && u.role === 'medewerker'
    ? await db
        .select({ at: accessLog.at, what: accessLog.what, viewer: users.name })
        .from(accessLog)
        .innerJoin(users, eq(users.id, accessLog.viewerId))
        .where(eq(accessLog.subjectId, u.id))
        .orderBy(desc(accessLog.at))
        .limit(10)
    : []

  return (
    <main>
      <div>
        <h1>{u.name}</h1>
        <p className="zacht">{type?.name ?? (u.role === 'beheerder' ? 'Beheerder' : u.role === 'begeleider' ? 'Stagebegeleider' : '')}</p>
      </div>
      {melding && MELDING[melding] && <div className={`melding ${melding === 'dubbel' ? 'fout' : 'goed'}`}>{MELDING[melding]}</div>}

      {list.length > 0 || (type?.rhythm === 'stage' && u.supervisorId === me.id) ? (
        <section className="kaart">
          <h2>Gesprekken</h2>
          <div className="lijst">
            {list.map(({ talk, slot }) => (
              <div key={talk.id} className="rij tussen">
                <span>
                  <strong>{talk.label}</strong>
                  <br />
                  <span className="zacht klein">{slot ? fmtDateLong(slot.startsAt) : ''} {STATUS[talk.status]}</span>
                </span>
                <Link href={`/beheer/gesprek/${talk.id}`} className="knop licht klein">Overzicht</Link>
              </div>
            ))}
          </div>
          {type?.rhythm === 'stage' && u.supervisorId === me.id && (
            <form action={gesprekKlaarzetten.bind(null, u.id)} className="rij">
              <select name="moment" aria-label="Welk gesprek" style={{ maxWidth: 260 }}>
                <option>Start stage</option>
                <option>Halverwege stage</option>
                <option>Einde stage</option>
                <option>Tussendoor</option>
              </select>
              <button className="knop klein">Gesprek klaarzetten</button>
            </form>
          )}
        </section>
      ) : null}

      {isAdmin && (
        <>
          <form action={bewerk.bind(null, u.id)} className="kaart">
            <h2>Gegevens</h2>
            <MedewerkerVelden u={u} types={types} begeleiders={begeleiders.filter((b) => b.id !== u.id)} />
            <div><button className="knop">Bewaren</button></div>
          </form>
          {u.active && (
            <section className="kaart">
              <h2>Inloggen</h2>
              <CodeKnop action={maakCode.bind(null, u.id)} />
            </section>
          )}
          {u.id !== me.id && (
            <section className="kaart">
              <h2>{u.active ? 'Uit dienst' : 'Uit dienst sinds ' + fmtDateLong(u.leftAt)}</h2>
              {u.active ? (
                <form action={uitDienst.bind(null, u.id)} className="stapel">
                  <p className="klein zacht">Inloggen kan dan niet meer. Na de bewaartermijn worden alle gegevens automatisch verwijderd.</p>
                  <div><button className="knop rood klein">Zet uit dienst</button></div>
                </form>
              ) : (
                <form action={weerActief.bind(null, u.id)}>
                  <button className="knop licht klein">Weer actief maken</button>
                </form>
              )}
            </section>
          )}
          {log.length > 0 && (
            <section className="kaart">
              <h2>Wie heeft gegevens bekeken</h2>
              <ul className="klein">
                {log.map((l, i) => <li key={i}>{fmtDateLong(l.at)}: {l.viewer}, {l.what}</li>)}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  )
}
