import Link from 'next/link'
import { asc, eq } from 'drizzle-orm'
import { db, employeeTypes, organisations, questionnaires, questions } from '@/db'
import { requireAdmin } from '@/lib/auth'
import { bewaarOrganisatie, bewaarType, bewaarVraag, nieuweVraag, nieuwType } from './actions'

export default async function Instellingen({ searchParams }: { searchParams: Promise<{ lijst?: string; melding?: string }> }) {
  const sp = await searchParams
  const me = await requireAdmin()
  const [org] = await db.select().from(organisations).where(eq(organisations.id, me.orgId))
  const types = await db.select().from(employeeTypes).where(eq(employeeTypes.orgId, me.orgId)).orderBy(asc(employeeTypes.position))
  const lists = await db.select().from(questionnaires).where(eq(questionnaires.orgId, me.orgId)).orderBy(asc(questionnaires.createdAt))
  const selected = lists.find((l) => l.id === sp.lijst)
  const qs = selected ? await db.select().from(questions).where(eq(questions.questionnaireId, selected.id)).orderBy(asc(questions.position)) : []

  return (
    <main>
      <h1>Instellingen</h1>
      {sp.melding && <div className="melding goed">Bewaard.</div>}

      <form action={bewaarOrganisatie} className="kaart">
        <h2>Organisatie</h2>
        <div className="velden">
          <div className="veld"><label htmlFor="naam">Naam</label><input id="naam" name="naam" type="text" defaultValue={org.name} /></div>
          <div className="veld"><label htmlFor="logo">Webadres van het logo (begint met https://)</label><input id="logo" name="logo" type="url" defaultValue={org.logoUrl ?? ''} /></div>
          <div className="veld"><label htmlFor="kleur_hoofd">Hoofdkleur</label><input id="kleur_hoofd" name="kleur_hoofd" type="color" defaultValue={org.colorPrimary} /></div>
          <div className="veld"><label htmlFor="kleur_accent">Accentkleur</label><input id="kleur_accent" name="kleur_accent" type="color" defaultValue={org.colorAccent} /></div>
          <div className="veld"><label htmlFor="duur">Duur van een gesprek (minuten)</label><input id="duur" name="duur" type="number" min={10} max={240} defaultValue={org.talkMinutes} /></div>
          <div className="veld"><label htmlFor="bewaar">Gegevens bewaren na uit dienst (maanden)</label><input id="bewaar" name="bewaar" type="number" min={1} max={120} defaultValue={org.retentionMonths} /></div>
        </div>
        <div><button className="knop">Bewaren</button></div>
      </form>

      <section className="kaart">
        <h2>Types medewerker</h2>
        <div className="lijst">
          {types.map((t) => (
            <form key={t.id} action={bewaarType.bind(null, t.id)} className="rij">
              <input name="naam" type="text" aria-label="Naam van het type" defaultValue={t.name} style={{ maxWidth: 260 }} />
              <span className="pil">{t.rhythm === 'stage' ? 'Momenten in de stage' : 'Vaste gespreksweken'}</span>
              <button className="knop licht klein">Bewaren</button>
              {t.questionnaireId && <Link href={`/beheer/instellingen?lijst=${t.questionnaireId}#vragen`} className="klein">Vragenlijst</Link>}
            </form>
          ))}
        </div>
        <form action={nieuwType} className="rij">
          <input name="naam" type="text" placeholder="Nieuw type, bijvoorbeeld Vrijwilliger" aria-label="Nieuw type" style={{ maxWidth: 300 }} />
          <select name="ritme" aria-label="Gespreksritme" style={{ maxWidth: 240 }}>
            <option value="weken">Vaste gespreksweken</option>
            <option value="stage">Momenten in de stage</option>
          </select>
          <button className="knop klein">Toevoegen</button>
        </form>
      </section>

      <section className="kaart" id="vragen">
        <h2>Vragenlijsten</h2>
        <div className="rij">
          {lists.map((l) => (
            <Link key={l.id} href={`/beheer/instellingen?lijst=${l.id}#vragen`} className={l.id === selected?.id ? 'knop klein' : 'knop licht klein'}>
              {l.name}
            </Link>
          ))}
        </div>
        {selected && (
          <>
            <p className="zacht klein">
              Pas je een vraag aan, dan blijft bij eerdere antwoorden de oude vraag staan. Zet een vraag uit in plaats van hem weg te halen.
            </p>
            <div className="lijst">
              {qs.map((q) => (
                <form key={q.id} action={bewaarVraag.bind(null, q.id)} className="stapel">
                  <div className="velden">
                    <div className="veld" style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor={`t-${q.id}`} className="klein">Vraag</label>
                      <textarea id={`t-${q.id}`} name="tekst" defaultValue={q.text} style={{ minHeight: 60 }} />
                    </div>
                    <div className="veld"><label htmlFor={`o-${q.id}`} className="klein">Onderwerp</label><input id={`o-${q.id}`} name="onderwerp" type="text" defaultValue={q.topic ?? ''} /></div>
                    <div className="veld">
                      <label htmlFor={`s-${q.id}`} className="klein">Antwoord</label>
                      <select id={`s-${q.id}`} name="soort" defaultValue={q.answerType}>
                        <option value="tekst">Tekst</option>
                        <option value="smiley">Smiley met toelichting</option>
                      </select>
                    </div>
                    <div className="veld"><label htmlFor={`v-${q.id}`} className="klein">Volgorde</label><input id={`v-${q.id}`} name="volgorde" type="number" defaultValue={q.position} /></div>
                  </div>
                  <div className="rij">
                    <label className="schakel"><input type="checkbox" name="actief" defaultChecked={q.active} /> Vraag staat aan</label>
                    <label className="schakel"><input type="checkbox" name="doel" defaultChecked={q.isGoal} /> Antwoord is een doel (komt op het profiel)</label>
                    <button className="knop licht klein">Bewaren</button>
                  </div>
                </form>
              ))}
            </div>
            <form action={nieuweVraag.bind(null, selected.id)} className="kaart tint">
              <h3>Vraag toevoegen</h3>
              <div className="velden">
                <div className="veld" style={{ gridColumn: '1 / -1' }}><label htmlFor="nieuw-tekst" className="klein">Vraag</label><input id="nieuw-tekst" name="tekst" type="text" /></div>
                <div className="veld"><label htmlFor="nieuw-onderwerp" className="klein">Onderwerp</label><input id="nieuw-onderwerp" name="onderwerp" type="text" /></div>
                <div className="veld">
                  <label htmlFor="nieuw-soort" className="klein">Antwoord</label>
                  <select id="nieuw-soort" name="soort"><option value="tekst">Tekst</option><option value="smiley">Smiley met toelichting</option></select>
                </div>
              </div>
              <div><button className="knop klein">Toevoegen</button></div>
            </form>
          </>
        )}
      </section>
    </main>
  )
}
