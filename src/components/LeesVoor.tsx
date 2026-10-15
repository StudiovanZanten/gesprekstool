'use client'
import { IconSpeaker } from './icons'

// Leest een tekst voor met de ingebouwde stem van de browser.
export function LeesVoor({ tekst }: { tekst: string }) {
  return (
    <button
      type="button"
      className="lees"
      onClick={() => {
        if (!('speechSynthesis' in window)) return
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(tekst)
        u.lang = 'nl-NL'
        u.rate = 0.9
        window.speechSynthesis.speak(u)
      }}
    >
      <IconSpeaker /> Lees voor
    </button>
  )
}
