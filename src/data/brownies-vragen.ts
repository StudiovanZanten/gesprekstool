// Startvragen voor Brownies&downieS Uden, aangeleverd door Reno (15 oktober 2026).
// Na het starten zijn ze aan te passen bij Instellingen.

export type SeedQuestion = {
  text: string
  type: 'tekst' | 'smiley'
  topic: string
  prev?: boolean
  help?: boolean
}

export const weekcheck: SeedQuestion[] = [
  { text: 'Hoe was jouw werkweek?', type: 'smiley', topic: 'Werkplezier en welzijn' },
  { text: 'Noem 1 succesje van deze week.', type: 'tekst', topic: 'Positieve ervaringen' },
  { text: 'Wat vond je lastig deze week? Heb je ergens hulp bij nodig?', type: 'tekst', topic: 'Werkdruk en begeleiding', help: true },
  { text: 'Geef jezelf een tip voor deze week.', type: 'tekst', topic: 'Persoonlijke ontwikkeling' },
]

export const vast: SeedQuestion[] = [
  { text: 'Hoe blij ben je met je werk op dit moment?', type: 'smiley', topic: 'Werkplezier' },
  { text: 'Welke taken gaan goed? En welke taken vind je nog lastig?', type: 'tekst', topic: 'Taken en verantwoordelijkheden' },
  { text: 'Hoe tevreden ben je over de kwaliteit van je eigen werk? Denk aan hygiëne, gastvrijheid en afspraken nakomen.', type: 'smiley', topic: 'Kwaliteit' },
  { text: "Wat gaat goed in de samenwerking met je collega's? Wat kan beter?", type: 'tekst', topic: 'Samenwerking' },
  { text: 'Hoe ervaar je de werkdruk, je rooster en je werktijden?', type: 'tekst', topic: 'Werkomstandigheden' },
  { text: 'Voel jij je prettig en veilig op je werk? Is er iets wat je wilt bespreken?', type: 'tekst', topic: 'Welzijn' },
  { text: 'Waar ben je de afgelopen periode trots op?', type: 'tekst', topic: 'Successen' },
  { text: 'Wat zou je graag willen leren of beter willen kunnen?', type: 'tekst', topic: 'Ontwikkeling' },
  { text: 'Wat kan jouw leidinggevende doen om jou beter te helpen?', type: 'tekst', topic: 'Feedback leidinggevende' },
  { text: 'Welke afspraken maakten we vorige keer? Hoe is dat gegaan?', type: 'tekst', topic: 'Vorige afspraken', prev: true },
  { text: 'Wat wil jij de komende drie maanden bereiken?', type: 'tekst', topic: 'Doelen en toekomst' },
]

export const oproep: SeedQuestion[] = [
  { text: 'Hoe leuk vind je het om bij Brownies&downieS te werken?', type: 'smiley', topic: 'Werkplezier' },
  { text: 'Weet je goed wat er van jou verwacht wordt tijdens je werk?', type: 'smiley', topic: 'Taken en verantwoordelijkheden' },
  { text: 'Wat gaat goed tijdens je werk? Denk aan gasten helpen, hygiëne en afspraken nakomen.', type: 'tekst', topic: 'Kwaliteit' },
  { text: "Hoe fijn vind je de samenwerking met je collega's?", type: 'smiley', topic: 'Samenwerking' },
  { text: 'Hoe tevreden ben je over je rooster, werktijden en werkdruk?', type: 'smiley', topic: 'Werkomstandigheden' },
  { text: 'Voel jij je welkom en prettig in ons team? Wil je daar iets over vertellen?', type: 'tekst', topic: 'Welzijn' },
  { text: 'Wat zou je graag beter willen leren tijdens je werk?', type: 'tekst', topic: 'Ontwikkeling' },
  { text: 'Wat kunnen wij als leidinggevenden beter doen voor jou?', type: 'tekst', topic: 'Feedback leidinggevende' },
  { text: 'Hebben we de afspraken van ons vorige gesprek goed uitgevoerd? Wat kan nog beter?', type: 'tekst', topic: 'Vorige afspraken', prev: true },
  { text: 'Hoe zie jij jouw toekomst bij Brownies&downieS?', type: 'tekst', topic: 'Toekomst' },
]

export const stage: SeedQuestion[] = [
  { text: 'Hoe leuk vind je jouw stage bij Brownies&downieS?', type: 'smiley', topic: 'Werkplezier' },
  { text: 'Welke taken kun je al goed zelfstandig uitvoeren?', type: 'tekst', topic: 'Taken en verantwoordelijkheden' },
  { text: 'Hoe goed lukt het jou om netjes, hygiënisch en gastvrij te werken en afspraken na te komen?', type: 'smiley', topic: 'Kwaliteit' },
  { text: "Hoe fijn vind je de samenwerking met je collega's en je stagebegeleider?", type: 'smiley', topic: 'Samenwerking' },
  { text: 'Hoe ervaar je de drukte, je werktijden en de taken die je krijgt?', type: 'tekst', topic: 'Werkomstandigheden' },
  { text: 'Voel jij je prettig en veilig tijdens je stage? Is er iets wat je wilt bespreken?', type: 'tekst', topic: 'Welzijn' },
  { text: 'Wat heb je de afgelopen periode geleerd? Waar ben je trots op?', type: 'tekst', topic: 'Ontwikkeling' },
  { text: 'Aan welke leerdoelen van school moet je nog werken?', type: 'tekst', topic: 'Leerdoelen school' },
  { text: 'Krijg je genoeg uitleg en hulp van je stagebegeleider? Wat kan beter?', type: 'tekst', topic: 'Feedback begeleiding' },
  { text: 'Welke afspraken hebben we vorige keer gemaakt? Hoe is dat gegaan?', type: 'tekst', topic: 'Vorige afspraken', prev: true },
  { text: 'Wat wil je de komende periode leren of verbeteren?', type: 'tekst', topic: 'Nieuwe leerdoelen' },
]
