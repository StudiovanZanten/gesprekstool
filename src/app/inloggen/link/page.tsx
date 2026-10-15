import { inloggenMetLink } from '../actions'

// De link uit de mail opent deze pagina. Pas na de klik op de knop wordt de link gebruikt,
// zodat een virusscanner die de link vooraf opent hem niet verbruikt.
export default async function Link({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  return (
    <main className="smal">
      <form action={inloggenMetLink} className="kaart">
        <h1>Welkom terug</h1>
        <input type="hidden" name="t" value={t ?? ''} />
        <button className="knop">Inloggen</button>
      </form>
    </main>
  )
}
