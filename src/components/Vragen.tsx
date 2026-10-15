'use client'
import { useState } from 'react'
import { LeesVoor } from './LeesVoor'

export type VraagProps = {
  id: string
  text: string
  answerType: 'tekst' | 'smiley'
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
}: {
  vragen: VraagProps[]
  action: (fd: FormData) => void | Promise<void>
  klaarTekst: string
  hulpNaam?: string
  hulpAan?: boolean
}) {
  const [stap, setStap] = useState(0)
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
          {v.answerType === 'smiley' ? (
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
              Ja, laat {hulpNaam} dit nu al weten. Dan wordt dit antwoord meteen gedeeld.
            </label>
          )}
        </div>
      ))}
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
