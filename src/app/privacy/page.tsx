export const metadata = { title: 'Privacy' }

// Uitleg voor medewerkers in eenvoudige taal. Laat deze tekst controleren door een privacyexpert.
export default function Privacy() {
  return (
    <main className="smal">
      <h1>Zo gaan we om met je gegevens</h1>
      <div className="kaart stapel">
        <p><strong>Wat je schrijft is van jou.</strong> Je weekchecks en je voorbereiding kun alleen jij zien. Pas als je zelf iets deelt, kan je leidinggevende of stagebegeleider het lezen.</p>
        <p><strong>Wie ziet wat je deelt?</strong> Bij stagiaires alleen de eigen stagebegeleider. Bij andere medewerkers de leidinggevende.</p>
        <p><strong>Veilig bewaard.</strong> Je antwoorden worden versleuteld opgeslagen op servers in Europa. We houden bij wie je gedeelde gegevens heeft bekeken.</p>
        <p><strong>Hoe lang?</strong> Zolang je bij ons werkt. Ga je weg, dan worden je gegevens na de afgesproken termijn automatisch verwijderd.</p>
        <p><strong>Je rechten.</strong> Je kunt altijd al je eigen gegevens terugkijken. Wil je een kopie, iets laten aanpassen of laten verwijderen? Vraag het aan je leidinggevende.</p>
      </div>
    </main>
  )
}
