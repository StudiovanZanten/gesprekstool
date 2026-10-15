'use client'
import { useActionState } from 'react'

// Maakt een nieuwe inlogcode. De code is maar één keer te zien; daarna staat alleen een versleutelde versie opgeslagen.
export function CodeKnop({ action }: { action: (prev: string | null) => Promise<string | null> }) {
  const [code, run, pending] = useActionState(action, null)
  return (
    <form action={run} className="stapel">
      {code ? (
        <>
          <span className="code">{code}</span>
          <p className="klein">Schrijf deze code over op een kaartje. Je ziet hem maar één keer. Een oude code werkt nu niet meer.</p>
        </>
      ) : (
        <p className="klein zacht">Voor wie geen mailadres heeft of liever met een code inlogt.</p>
      )}
      <div>
        <button className="knop licht klein" disabled={pending}>{code ? 'Nog een nieuwe code maken' : 'Inlogcode maken'}</button>
      </div>
    </form>
  )
}
