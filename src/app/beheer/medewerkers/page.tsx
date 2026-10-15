import Link from 'next/link'
import { and, asc, eq, ne } from 'drizzle-orm'
import { db, employeeTypes, users } from '@/db'
import { MedewerkerVelden } from '@/components/MedewerkerVelden'
import { employeesVisibleTo } from '@/lib/access'
import { requireStaff } from '@/lib/auth'
import { voegToe } from './actions'

const ROL: Record<string, string> = { beheerder: 'Beheerder', begeleider: 'Stagebegeleider', medewerker: 'Medewerker' }

export default async function Medewerkers({ searchParams }: { searchParams: Promise<{ melding?: string }> }) {
  const { melding } = await searchParams
  const me = await requireStaff()
  const types = await db.select().from(employeeTypes).where(eq(employeeTypes.orgId, me.orgId)).orderBy(asc(employeeTypes.position))
  const typeName = (id: string | null) => types.find((t) => t.id === id)?.name ?? ''
  const isAdmin = me.role === 'beheerder'
  const people = isAdmin
    ? await db.select().from(users).where(eq(users.orgId, me.orgId)).orderBy(asc(users.name))
    : await employeesVisibleTo(me)
  const begeleiders = await db
    .select()
    .from(users)
    .where(and(eq(users.orgId, me.orgId), ne(users.role, 'medewerker'), eq(users.active, true)))
    .orderBy(asc(users.name))

  return (
    <main>
      <h1>{isAdmin ? 'Medewerkers' : 'Mijn stagiaires'}</h1>
      {melding === 'dubbel' && <div className="melding fout">Dit mailadres is al in gebruik.</div>}
      {melding === 'naam' && <div className="melding fout">Vul een naam in.</div>}
      <section className="kaart">
        {people.length ? (
          <div className="scroll">
            <table className="tabel">
              <thead><tr><th>Naam</th><th>Rol</th><th>Type</th><th></th></tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/beheer/medewerkers/${p.id}`}>{p.name}</Link></td>
                    <td>{ROL[p.role]}</td>
                    <td>{typeName(p.typeId)}</td>
                    <td>{!p.active && <span className="pil rood">Uit dienst</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="zacht">Nog niemand.</p>
        )}
      </section>
      {isAdmin && (
        <form action={voegToe} className="kaart">
          <h2>Iemand toevoegen</h2>
          <MedewerkerVelden types={types} begeleiders={begeleiders} />
          <div><button className="knop">Toevoegen</button></div>
        </form>
      )}
    </main>
  )
}
