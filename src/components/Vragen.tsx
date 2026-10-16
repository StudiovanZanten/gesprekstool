'use client'
import { useState } from 'react'
import { LeesVoor } from './LeesVoor'
import { ANDERS, ONDERDELEN } from '@/lib/questions'

export type VraagProps = {
  id: string
  text: string
  answerType: 'tekst' | 'smiley' | 'keuze'
  section?: string | null
  options?: string[]
  smileyVisible?: boolean
  allowNote: boolean
  helpSignal: boolean
  prevAgreements?: string[]
  value: string
  smiley: number | null
  note: string
}

const SMILEYS = [
  { v: 1, emoji: '😞', label: 'Helemaal niet goed' },
  { v: 2, emoji: '🙁', label: 'Niet zo goed' },
  { v: 3, emoji: '😐', label: 'Gaat wel' },
  { v: 4, emoji: '🙂', label: 'Goed' },
  { v: 5, emoji: '😄', label: 'Heel goed' },
]

// Toont één vraag per scherm. Alle antwoorden zitten in hetzelfde formulier en worden in één keer opgeslagen.
export function Vragen({
  vragen,
  action,
  klaarTekst,
  hulpNaam,
  hulpAan,
  deelAan,
}: {
  vragen: VraagProps[]
  action: (fd: FormData) => void | Promise<void>
  klaarTekst: string
  hulpNaam?: string
  hulpAan?: boolean
  // Weekcheck: schakelaar om alles te delen. Staat standaard aan.
  deelAan?: boolean
}) {
  const [stap, setStap] = useState(0)
  const [keuze, setKeuze] = useState<Record<string, string>>(() => Object.fromEntries(vragen.map((v) => [v.id, v.value])))
  const laatste = stap === vragen.length - 1
  return (
    <form action={action} className="kaart">
      <div className="voortgang" aria-hidden="true">
        <div style={{ width: `${((stap + 1) / vragen.length) * 100}%` }} />
      </div>
      <p className="zacht klein">
        Vraag {stap + 1} van {vragen.length}. Je mag een vraag overslaan.
      </p>
      {vragen.map((v, i) => (
        <div key={v.id} className="vraag" hidden={i !== stap}>
          {v.section && ONDERDELEN[v.section] && (
            <p className="onderdeel">
              {v.section}. {ONDERDELEN[v.section]}
            </p>
          )}
          <div className="vraag-kop">
            <label htmlFor={`a-${v.id}`} className="vraag-tekst">
              {v.text}
            </label>
            <LeesVoor tekst={v.text} />
          </div>
          {v.prevAgreements && (
            <div className="melding">
              <strong>Afspraken van de vorige keer</strong>
              {v.prevAgreements.length ? (
                <ul>{v.prevAgreements.map((a, j) => <li key={j}>{a}</li>)}</ul>
              ) : (
                <p>Er zijn nog geen eerdere afspraken.</p>
              )}
            </div>
          )}
          {v.answerType === 'keuze' ? (
            <>
              <div className="keuzes" role="radiogroup" aria-label={v.text}>
                {[...(v.options ?? []), ANDERS].map((o, j) => (
                  <span key={o}>
                    <input
                      type="radio"
                      name={`a-${v.id}`}
                      id={`k-${v.id}-${j}`}
                      value={o}
                      checked={keuze[v.id] === o}
                      onChange={() => setKeuze({ ...keuze, [v.id]: o })}
                    />
                    <label htmlFor={`k-${v.id}-${j}`}>
                      <span className="letter">{String.fromCharCode(65 + j)}</span>
                      {o === ANDERS ? 'Anders, namelijk...' : o}
                    </label>
                  </span>
                ))}
              </div>
              {keuze[v.id] === ANDERS && (
                <div className="veld">
                  <label htmlFor={`n-${v.id}`} className="klein">Wat dan?</label>
                  <textarea id={`n-${v.id}`} name={`n-${v.id}`} defaultValue={v.note} autoFocus />
                </div>
              )}
            </>
          ) : v.answerType === 'smiley' ? (
            <>
              <div className="smileys" role="radiogroup" aria-label={v.text}>
                {SMILEYS.map((s) => (
                  <span key={s.v}>
                    <input type="radio" name={`s-${v.id}`} id={`s-${v.id}-${s.v}`} value={s.v} defaultChecked={v.smiley === s.v} />
                    <label htmlFor={`s-${v.id}-${s.v}`}>
                      <span>{s.emoji}</span>
                      {s.label}
                    </label>
                  </span>
                ))}
              </div>
              {v.smileyVisible && (
                <p className="zacht klein">{hulpNaam ? `${hulpNaam[0].toUpperCase()}${hulpNaam.slice(1)}` : 'Je leidinggevende'} ziet altijd welke smiley je kiest.</p>
              )}
              {v.allowNote && (
                <div className="veld">
                  <label htmlFor={`a-${v.id}`} className="klein">
                    Wil je iets uitleggen? (mag ook leeg blijven)
                  </label>
                  <textarea id={`a-${v.id}`} name={`n-${v.id}`} defaultValue={v.note} />
                </div>
              )}
            </>
          ) : (
            <textarea id={`a-${v.id}`} name={`a-${v.id}`} defaultValue={v.value} />
          )}
          {v.helpSignal && hulpNaam && (
            <label className="schakel">
              <input type="checkbox" name="hulp" defaultChecked={hulpAan} />
              Ik wil graag hulp. Laat {hulpNaam} dit nu al weten. Dan wordt dit antwoord meteen gedeeld.
            </label>
          )}
        </div>
      ))}
      {deelAan !== undefined && hulpNaam && (
        <label className="schakel" hidden={!laatste}>
          <input type="checkbox" name="delen" defaultChecked={deelAan} />
          Deel deze weekcheck met {hulpNaam}. Zet dit uit als je hem liever voor jezelf houdt.
        </label>
      )}
      <div className="rij tussen">
        <div className="rij">
          {stap > 0 && (
            <button type="button" className="knop licht" onClick={() => setStap(stap - 1)}>
              Vorige
            </button>
          )}
          <button type="submit" name="later" value="1" className="knop licht">
            Opslaan, later verder
          </button>
        </div>
        {laatste ? (
          <button key="klaar" type="submit" className="knop">
            {klaarTekst}
          </button>
        ) : (
          <button key="volgende" type="button" className="knop" onClick={() => setStap(stap + 1)}>
            Volgende
          </button>
        )}
      </div>
    </form>
  )
}
