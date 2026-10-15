import { fmtDateLong, todayStr } from '@/lib/dates'
import type { profileData } from '@/lib/profile'
import { wisselAfspraak } from '@/app/profiel/actions'

type Data = Awaited<ReturnType<typeof profileData>>

// Het profiel: lopende afspraken, doelen en alle eerdere gesprekken op één pagina.
export function Profiel({ data, zelf }: { data: Data; zelf: boolean }) {
  const today = todayStr()
  return (
    <>
      <div className="raster">
        <section className="kaart">
          <h2>{zelf ? 'Mijn afspraken' : 'Lopende afspraken'}</h2>
          {data.open.length ? (
            <div className="lijst">
              {data.open.map((a) => (
                <form key={a.id} action={wisselAfspraak.bind(null, a.id)} className="rij tussen">
                  <span>
                    {a.text}
                    <br />
                    <span className="zacht klein">
                      {a.reviewDate ? `Terugkijken op ${fmtDateLong(a.reviewDate)}` : a.talkLabel}
                    </span>{' '}
                    {a.reviewDate && a.reviewDate < today && <span className="pil let-op">Datum is voorbij</span>}
                  </span>
                  <button className="knop licht klein">Gelukt</button>
                </form>
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
                  <form key={a.id} action={wisselAfspraak.bind(null, a.id)} className="rij tussen">
                    <span>✓ {a.text}</span>
                    <button className="knop licht klein">Toch nog niet</button>
                  </form>
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
      <section className="stapel">
        <h2>{zelf ? 'Mijn gesprekken' : 'Eerdere gesprekken'}</h2>
        {data.held.length === 0 && <p className="zacht">Nog geen gesprekken gevoerd.</p>}
        {data.held.map((t) => (
          <details key={t.id} className="kaart">
            <summary>
              <strong>{fmtDateLong(t.date)}</strong>, {t.label}
            </summary>
            <h3>Wat gaat goed</h3>
            <p>{t.good || 'Niet ingevuld.'}</p>
            <h3>Wat vraagt aandacht</h3>
            <p>{t.attention || 'Niet ingevuld.'}</p>
            <h3>Afspraken</h3>
            {t.agreements.length ? (
              <ul>{t.agreements.map((a) => <li key={a.id}>{a.done ? '✓ ' : ''}{a.text}</li>)}</ul>
            ) : (
              <p className="zacht">Geen afspraken.</p>
            )}
          </details>
        ))}
      </section>
    </>
  )
}
