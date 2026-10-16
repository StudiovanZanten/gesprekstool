import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db, organisations, talks, users } from '@/db'
import { Kop, orgStyle } from '@/components/Kop'
import { PrintKnop } from '@/components/PrintKnop'
import { canViewEmployee, logAccess } from '@/lib/access'
import { requireUser } from '@/lib/auth'
import { decrypt } from '@/lib/crypto'
import { fmtDateLong } from '@/lib/dates'
import { EIGENAREN, STATUSSEN } from '@/lib/questions'
import { agreementsOf, slotForTalk } from '@/lib/talks'
import { bevestigVerslag } from './actions'

// Het verslag van een gevoerd gesprek, voor de medewerker en de leidinggevende. Te bewaren als PDF.
export default async function Verslag({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ melding?: string }> }) {
  const { id } = await params
  const { melding } = await searchParams
  const me = await requireUser()
  const [talk] = await db.select().from(talks).where(and(eq(talks.id, id), eq(talks.orgId, me.orgId)))
  if (!talk || talk.status !== 'gevoerd') notFound()
  const [emp] = await db.select().from(users).where(eq(users.id, talk.employeeId))
  const zelf = emp.id === me.id
  if (!zelf && (me.role === 'medewerker' || !(await canViewEmployee(me, emp)))) notFound()
  await logAccess(me, emp.id, `verslag ${talk.label}`)
  const [org] = await db.select().from(organisations).where(eq(organisations.id, me.orgId))
  const slot = await slotForTalk(talk.id)
  const ag = await agreementsOf(talk.id)
  const leidingId = talk.reportById ?? talk.hostId
  const [leiding] = leidingId ? await db.select().from(users).where(eq(users.id, leidingId)) : []
  const [bevestiger] = talk.hostConfirmedBy ? await db.select().from(users).where(eq(users.id, talk.hostConfirmedBy)) : []
  const voornaam = emp.name.split(' ')[0]
  const reactie = decrypt(talk.employeeReactionEnc)
  const blok = (titel: string, tekst: string) => (
    <>
      <h3>{titel}</h3>
      <p className="tekstblok">{tekst || 'Niet ingevuld.'}</p>
    </>
  )

  return (
    <div style={orgStyle(org)}>
      <Kop org={org} user={me} />
      <main className="smal">
        <p className="klein geen-print">
          <Link href={zelf ? '/mijn/profiel' : `/beheer/gesprek/${talk.id}`}>Terug</Link>
        </p>
        {melding === 'afgerond' && <div className="melding goed geen-print">Het gesprek is afgerond. {voornaam} heeft een mail gekregen om het verslag te lezen.</div>}
        {melding === 'bevestigd' && <div className="melding goed geen-print">Dank je wel, dat is bewaard.</div>}
        <section className="kaart verslag">
          <div className="rij tussen">
            <div>
              <p className="onderdeel">Samen Groeien</p>
              <h1>Verslag van het gesprek</h1>
            </div>
            <span className="geen-print"><PrintKnop /></span>
          </div>
          <table className="tabel">
            <tbody>
              <tr><th>Medewerker</th><td>{emp.name}</td></tr>
              <tr><th>Datum</th><td>{fmtDateLong(slot?.startsAt ?? talk.heldAt)}</td></tr>
              <tr><th>Leidinggevende</th><td>{leiding?.name ?? 'Onbekend'}</td></tr>
              <tr><th>Gesprek</th><td>{talk.label}</td></tr>
              <tr><th>Volgend gesprek</th><td>{talk.nextTalkDate ? fmtDateLong(talk.nextTalkDate) : 'Nog niet bekend'}</td></tr>
            </tbody>
          </table>
          {blok('Waar hebben we het over gehad?', decrypt(talk.topicsEnc))}
          {blok('Wat gaat goed?', decrypt(talk.goodEnc))}
          {blok('Wat vraagt aandacht?', decrypt(talk.attentionEnc))}
          {blok('Ontwikkeldoelen', decrypt(talk.goalsEnc))}
          <h3>Afspraken</h3>
          {ag.length ? (
            <ol className="afspraken">
              {ag.map((a) => (
                <li key={a.id}>
                  {a.text}
                  <br />
                  <span className="zacht klein">
                    {[a.owner ? `Wie: ${EIGENAREN[a.owner]}` : '', a.reviewDate ? `streefdatum ${fmtDateLong(a.reviewDate)}` : '', `voortgang: ${(STATUSSEN[a.status] ?? a.status).toLowerCase()}`].filter(Boolean).join(', ')}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p>Geen afspraken.</p>
          )}
          {reactie && blok(`Reactie van ${voornaam}`, reactie)}
          <h3>Gelezen</h3>
          <p>
            {emp.name}: {talk.employeeConfirmedAt ? `gelezen op ${fmtDateLong(talk.employeeConfirmedAt)}` : 'nog niet bevestigd'}
            <br />
            {bevestiger?.name ?? leiding?.name ?? 'Leidinggevende'}: {talk.hostConfirmedAt ? `gelezen op ${fmtDateLong(talk.hostConfirmedAt)}` : 'nog niet bevestigd'}
          </p>
          <p className="zacht klein">Gelezen betekent: ontvangen en doorgelezen. Het betekent niet dat iemand het overal mee eens is.</p>
        </section>

        {zelf ? (
          <form action={bevestigVerslag.bind(null, talk.id)} className="kaart geen-print">
            <h2>{talk.employeeConfirmedAt ? 'Je reactie' : 'Heb je het verslag gelezen?'}</h2>
            <p className="zacht">Klik op de knop als je het verslag gelezen hebt. Dat betekent niet dat je het overal mee eens bent.</p>
            <div className="veld">
              <label htmlFor="reactie">Wil je iets aanvullen of ben je het ergens niet mee eens? Schrijf het hier. (mag ook leeg blijven)</label>
              <textarea id="reactie" name="reactie" defaultValue={reactie} />
            </div>
            <div><button className="knop">{talk.employeeConfirmedAt ? 'Reactie bewaren' : 'Ik heb het verslag gelezen'}</button></div>
          </form>
        ) : (
          !talk.hostConfirmedAt && (
            <form action={bevestigVerslag.bind(null, talk.id)} className="kaart geen-print">
              <p>Klopt het verslag? Bevestig dat je het gelezen hebt.</p>
              <div><button className="knop">Ik heb het verslag gelezen</button></div>
            </form>
          )
        )}
      </main>
    </div>
  )
}
