import Link from 'next/link'
import { fmtDateLong, todayStr } from '@/lib/dates'
import type { profileData } from '@/lib/profile'
import { EIGENAREN } from '@/lib/questions'
import { zetVoortgang } from '@/app/profiel/actions'
import { StatusKeuze } from './StatusKeuze'

type Data = Awaited<ReturnType<typeof profileData>>

// Het profiel: ontwikkelplan met afspraken, doelen en alle eerdere gesprekken op één pagina.
export function Profiel({ data, zelf }: { data: Data; zelf: boolean }) {
  const today = todayStr()
  const wie = (o: string | null) => (!o ? '' : zelf ? { medewerker: 'Jij', leidinggevende: 'Je leidinggevende', samen: 'Samen' }[o] : EIGENAREN[o])
  return (
    <>
      <div className="raster">
        <section className="kaart">
          <h2>{zelf ? 'Mijn ontwikkelplan' : 'Ontwikkelplan'}</h2>
          {data.devGoals && (
            <div className="melding">
              <strong>Ontwikkeldoelen</strong>
              <p className="tekstblok" style={{ marginBottom: 0 }}>{data.devGoals}</p>
            </div>
          )}
          {data.open.length ? (
            <div className="lijst">
              {data.open.map((a) => (
                <div key={a.id} className="rij tussen">
                  <span>
                    {a.text}
                    <br />
                    <span className="zacht klein">
                      {[wie(a.owner), a.reviewDate ? `streefdatum ${fmtDateLong(a.reviewDate)}` : a.talkLabel].filter(Boolean).join(', ')}
                    </span>{' '}
                    {a.reviewDate && a.reviewDate < today && <span className="pil let-op">Datum is voorbij</span>}
                  </span>
                  <StatusKeuze key={a.status} action={zetVoortgang.bind(null, a.id)} status={a.status} label={`Voortgang: ${a.text}`} />
                </div>
              ))}
            </div>
          ) : (
            <p className="zacht">Er staan geen open afspraken.</p>
          )}
          {data.done.length > 0 && (
            <details>
              <summary className="klein">Gelukt ({data.done.length})</summary>
              <div className="lijst">
                {data.done.map((a) => (
                  <div key={a.id} className="rij tussen">
                    <span>✓ {a.text}</span>
                    <StatusKeuze key={a.status} action={zetVoortgang.bind(null, a.id)} status={a.status} label={`Voortgang: ${a.text}`} />
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
        <section className="kaart">
          <h2>{zelf ? 'Mijn doelen' : 'Doelen'}</h2>
          {data.goals.length ? (
            <div className="lijst">
              {data.goals.map((g, i) => (
                <div key={i}>
                  <span className="zacht klein">{g.question}</span>
                  <br />
                  {g.answer}
                </div>
              ))}
            </div>
          ) : (
            <p className="zacht">{zelf ? 'Na je eerste gesprek staan hier je doelen.' : 'Nog geen gedeelde doelen.'}</p>
          )}
        </section>
      </div>
      <section className="kaart">
        <h2>{zelf ? 'Mijn gesprekken' : 'Eerdere gesprekken'}</h2>
        {data.held.length === 0 ? (
          <p className="zacht">Nog geen gesprekken gevoerd.</p>
        ) : (
          <div className="lijst">
            {data.held.map((t) => (
              <div key={t.id} className="rij tussen">
                <span>
                  <strong>{fmtDateLong(t.date)}</strong>, {t.label}
                  <br />
                  {t.employeeConfirmedAt ? (
                    <span className="pil goed">Gelezen</span>
                  ) : (
                    <span className="pil let-op">{zelf ? 'Nog lezen' : 'Nog niet gelezen door medewerker'}</span>
                  )}
                </span>
                <Link href={`/verslag/${t.id}`} className={`knop klein ${zelf && !t.employeeConfirmedAt ? '' : 'licht'}`}>Verslag</Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
