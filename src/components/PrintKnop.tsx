'use client'

// Opent het printvenster. Daar kies je "Opslaan als PDF".
export function PrintKnop() {
  return (
    <button type="button" className="knop licht klein" onClick={() => window.print()}>
      Opslaan als PDF
    </button>
  )
}
