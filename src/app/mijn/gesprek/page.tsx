import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { db, employeeTypes, users } from '@/db'
import { Antwoord } from '@/components/Antwoord'
import { Vragen } from '@/components/Vragen'
import { requireUser } from '@/lib/auth'
import { fmtDate, fmtTime, TZ } from '@/lib/dates'
import {
  activeQuestions,
  agreementsOf,
  currentTalk,
  freeSlotsFor,
  lastHeldTalk,
  slotForTalk,
  talkAnswers,
  weekchecksSince,
} from '@/lib/talks'
import { bewaarVoorbereiding, deelAntwoorden, kiesMoment } from './actions'

const MELDINGEN: Record<string, [string, string]> = {
  gekozen: ['goed', 'Je moment staat vast. Je leidinggevende krijgt een bericht.'],
  bezet: ['fout', 'Dat moment is net door iemand anders gekozen. Kies een ander moment.'],
  telaat: ['fout', 'Je gesprek is binnen twee dagen. Wil je het verzetten? Vraag het dan even persoonlijk.'],
  gedeeld: ['goed', 'Gedeeld. Je kunt dit tot het gesprek nog aanpassen.'],
}

type SP = Promise<{ vragen?: string; delen?: string; ander?: string; melding?: string }>

export default async function Gesprek({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const user = await requireUser()
  const talk = await currentTalk(user)
  if (!talk) {
    return (
      <main className="smal">
        <h1>Mijn gesprek</h1>
        <div className="kaart tint">
          <p>Er staat nu geen gesprek klaar. Je krijgt een bericht als het zover is.</p>
          <Link href="/mijn" className="knop licht">Terug naar start</Link>
        </div>
      </main>
    )
  }
  const [type] = user.typeId ? await db.select().from(employeeTypes).where(eq(employeeTypes.id, user.typeId)) : []
  const qs = await activeQuestions(type?.questionnaireId ?? null)
  const given = await talkAnswers(talk.id)
  const prev = await lastHeldTalk(user.id)
  const prevAgreements = prev ? (await agreementsOf(prev.id)).map((a) => a.text) : []
  const slot = await slotForTalk(talk.id)
  const [host] = slot ? await db.select().from(users).where(eq(users.id, slot.hostId)) : []
  const melding = sp.melding ? MELDINGEN[sp.melding] : null
  const isIntern = type?.rhythm === 'stage'
  const wie = isIntern ? 'je stagebegeleider' : 'je leidinggevende'

  if (sp.vragen) {
    return (
      <main className="smal">
        <h1>Mijn voorbereiding</h1>
        <p className="zacht">Neem er rustig de tijd voor. Wat je schrijft is eerst alleen van jou. Daarna kies je zelf wat je deelt.</p>
        <Vragen
          action={bewaarVoorbereiding.bind(null, talk.id)}
          klaarTekst="Klaar, naar delen"
          vragen={qs.map((q) => {
            const a = given.find((x) => x.questionId === q.id)
            return {
              id: q.id,
              text: q.text,
              answerType: q.answerType,
              allowNote: q.allowNote,
              helpSignal: false,
              prevAgreements: q.showPrevAgreements ? prevAgreements : undefined,
              value: a?.value ?? '',
              smiley: a?.smiley ?? null,
              note: a?.note ?? '',
            }
          })}
        />
      </main>
    )
  }

  if (sp.delen) {
    const checks = await weekchecksSince(user.id, prev?.heldAt ?? null)
    return (
      <main className="smal">
        <h1>Klaarzetten voor mijn gesprek</h1>
        <p>Zet aan wat {wie} mag zien. Wat uit staat, blijft alleen van jou.</p>
        <form action={deelAntwoorden.bind(null, talk.id)} className="stapel">
          <div className="kaart">
            <h2>Mijn voorbereiding</h2>
            {given.length ? (
              <div className="lijst">
                {given.map((a) => (
                  <label key={a.id} className="schakel">
                    <input type="checkbox" name="deel" value={a.id} defaultChecked={a.shared || !talk.sharedAt} />
                    <span>
                      <span className="zacht klein">{a.questionText}</span>
                      <br />
                      <Antwoord a={a} />
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="zacht">Je hebt de vragen nog niet ingevuld. <Link href="/mijn/gesprek?vragen=1">Begin hier</Link>.</p>
            )}
          </div>
          <div className="kaart">
            <h2>Mijn weekchecks</h2>
            <p className="zacht klein">Sinds {prev ? 'je vorige gesprek' : 'je begon'}. Deze staan standaard uit.</p>
            {checks.length ? (
              checks.map((c) => (
                <div key={c.id} className="stapel">
                  <strong>Week {c.week}</strong>
                  {c.answers.map((a) => (
                    <label key={a.id} className="schakel">
                      <input type="checkbox" name="deel" value={a.id} defaultChecked={a.shared} />
                      <span>
                        <span className="zacht klein">{a.questionText}</span>
                        <br />
                        <Antwoord a={a} />
                      </span>
                    </label>
                  ))}
                </div>
              ))
            ) : (
              <p className="zacht">Nog geen weekchecks.</p>
            )}
          </div>
          <div className="rij">
            <button className="knop">Delen met {wie}</button>
            <Link href="/mijn/gesprek" className="knop licht">Terug</Link>
          </div>
        </form>
      </main>
    )
  }

  const free = !slot || sp.ander ? await freeSlotsFor(user, talk) : []
  const days = new Map<string, typeof free>()
  for (const s of free) {
    const k = s.startsAt.toLocaleDateString('sv-SE', { timeZone: TZ })
    days.set(k, [...(days.get(k) ?? []), s])
  }
  const canChange = slot && slot.startsAt.getTime() - Date.now() > 2 * 86400000

  return (
    <main className="smal">
      <h1>Mijn gesprek</h1>
      <p className="zacht">{talk.label}</p>
      {melding && <div className={`melding ${melding[0]}`}>{melding[1]}</div>}

      <section className="kaart">
        <h2>1. Kies je moment</h2>
        {slot && !sp.ander ? (
          <>
            <p>
              Je gesprek is op <strong>{fmtDate(slot.startsAt)} om {fmtTime(slot.startsAt)} uur</strong>
              {host ? ` met ${host.name}` : ''}.
            </p>
            <div className="rij">
              <a href={`/agenda/${slot.id}`} className="knop licht klein">Zet in mijn agenda</a>
              {canChange && <Link href="/mijn/gesprek?ander=1" className="knop licht klein">Ander moment kiezen</Link>}
            </div>
          </>
        ) : days.size ? (
          [...days.entries()].map(([day, list]) => (
            <div key={day} className="stapel">
              <strong>{fmtDate(day)}</strong>
              <div className="rij">
                {list.map((s) => (
                  <form key={s.id} action={kiesMoment.bind(null, talk.id)}>
                    <input type="hidden" name="slot" value={s.id} />
                    <button className="moment">{fmtTime(s.startsAt)}</button>
                  </form>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="zacht">Er staan nog geen momenten open. Je krijgt een bericht zodra je kunt kiezen.</p>
        )}
      </section>

      <section className="kaart">
        <h2>2. Bereid je voor</h2>
        <p>
          {given.length
            ? `Je hebt ${given.length} van de ${qs.length} vragen beantwoord.`
            : `${qs.length} vragen, ongeveer tien minuten. Je kunt tussendoor stoppen.`}
        </p>
        <Link href="/mijn/gesprek?vragen=1" className="knop">{given.length ? 'Verder of aanpassen' : 'Beginnen'}</Link>
      </section>

      <section className="kaart">
        <h2>3. Kies wat je deelt</h2>
        <p>{talk.sharedAt ? `Gedeeld met ${wie}. Je kunt het tot het gesprek nog aanpassen.` : `Pas als je deelt, kan ${wie} je antwoorden zien.`}</p>
        <Link href="/mijn/gesprek?delen=1" className={talk.sharedAt ? 'knop licht' : 'knop'}>
          {talk.sharedAt ? 'Aanpassen wat ik deel' : 'Klaarzetten en delen'}
        </Link>
      </section>
    </main>
  )
}
