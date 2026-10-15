# Gesprekstool

Tool waarin medewerkers zich voorbereiden op hun functioneringsgesprek. Gebouwd voor Brownies&downieS Uden, klaar om later aan andere organisaties aan te bieden.

Het ontwerp (rollen, techniek, vragenlijsten, gegevens) staat in het document "Gesprekstool ontwerp".

## Wat zit erin

**Voor medewerkers**
- Inloggen met een link in de mail, of met een inlogcode op een kaartje.
- Mijn week: de wekelijkse check, één vraag per scherm, met smileys en een knop Lees voor.
- Mijn gesprek: moment kiezen in de gespreksweek, voorbereiding invullen, en zelf kiezen wat gedeeld wordt.
- Mijn profiel: lopende afspraken (af te vinken), doelen uit het laatste gesprek en alle eerdere gesprekken. Plus terugkijken van alle eigen antwoorden en weekchecks.

**Voor beheerder en stagebegeleider**
- Start: wie om hulp vraagt, komende gesprekken, wie nog geen moment koos, wie al drie weken geen weekcheck deed.
- Gespreksoverzicht: gedeelde voorbereiding, gedeelde succesjes en tips, de vorige afspraken, en het verslag in drie delen (wat gaat goed, wat vraagt aandacht, wat spreken we af).
- Planning: vaste gespreksweken per type medewerker, en momenten openzetten.
- Profiel per medewerker: dezelfde afspraken, doelen en gesprekken, met alleen wat gedeeld is.
- Medewerkers: toevoegen, type kiezen, stagebegeleider koppelen, inlogcode maken, uit dienst zetten.
- Instellingen: naam, logo, kleuren, gespreksduur, bewaartermijn, types en vragenlijsten.

**Automatisch, elke ochtend**
- Maandag: herinnering voor de weekcheck.
- Uitnodiging zodra een gesprek klaarstaat (drie weken voor de gespreksweek).
- Herinnering als een week voor de gespreksweek nog geen moment is gekozen.
- Herinnering als drie dagen voor het gesprek de voorbereiding nog niet gedeeld is.
- Gegevens van wie langer dan de bewaartermijn uit dienst is, worden verwijderd.

## Privacy, kort

- Alles wat een medewerker schrijft is eerst privé. Pas na Delen ziet de leidinggevende het.
- Stagiaires zijn alleen zichtbaar voor hun eigen stagebegeleider.
- Antwoorden, toelichtingen, verslagen en afspraken staan versleuteld in de database.
- De tool houdt bij wie welk gespreksoverzicht heeft geopend (te zien bij de medewerker).
- Mails bevatten nooit de inhoud van antwoorden, alleen een seintje en een link.
- Laat de punten uit het ontwerpdocument nakijken door een privacyexpert.

## Online zetten (eenmalig)

Je hebt nodig: je Vercel account, een gratis Neon account en je Brevo account. Wachtwoorden en sleutels vul je zelf in, nooit in de chat.

1. **Database maken.** Maak bij Neon een nieuw project, regio Frankfurt (eu-central-1). Kopieer de verbindingsregel (begint met `postgres://`).
2. **Project op Vercel.** Kies op Vercel "Add New Project" en kies de repository `gesprekstool`.
3. **Instellingen invullen.** Vul bij Environment Variables in (voorbeeld staat in `.env.example`):
   - `DATABASE_URL`: de verbindingsregel van Neon.
   - `ENCRYPTION_KEY`, `APP_SECRET` en `CRON_SECRET`: drie verschillende lange geheimen. Maak ze met `npm run sleutel` (drie keer). Bewaar `ENCRYPTION_KEY` ook ergens veilig: zonder die sleutel zijn de antwoorden niet meer te lezen.
   - `APP_URL`: het webadres van de tool, bijvoorbeeld `https://gesprekken.studiovanzanten.com`.
   - `BREVO_API_KEY`, `MAIL_FROM` en `MAIL_FROM_NAME`: voor de mails.
4. **Tabellen en eerste beheerder.** Op je laptop, in de map van het project:
   ```
   npm install
   DATABASE_URL="(regel van Neon)" npx drizzle-kit push
   DATABASE_URL="(regel van Neon)" SEED_ADMIN_NAME="Jouw naam" SEED_ADMIN_EMAIL="jouw@mailadres.nl" npm run db:seed
   ```
   Dit zet Brownies&downieS klaar met de vragenlijsten en jou als beheerder.
5. **Deploy** op Vercel. Daarna log je in met je mailadres.
6. **Eigen webadres (optioneel).** Voeg bij Vercel een domein toe, bijvoorbeeld `gesprekken.studiovanzanten.com`, en zet de regel die Vercel geeft bij Hostnet in de DNS.

## Op je laptop proberen

```
npm install
cp .env.example .env      (en vul DATABASE_URL en de geheimen in)
npx drizzle-kit push
SEED_ADMIN_NAME="Jouw naam" SEED_ADMIN_EMAIL="jouw@mailadres.nl" npm run db:seed -- --demo
npm run dev
```

Open http://localhost:3000. Zonder `BREVO_API_KEY` verschijnt de inloglink in het venster waar `npm run dev` draait. Met `--demo` komen er verzonnen testpersonen bij (vast@demo.test, oproep@demo.test, stage@demo.test, begeleider@demo.test). Gebruik `--demo` nooit online.

## Een nieuwe klant toevoegen (later)

Elke organisatie staat volledig los van de andere. Een nieuwe organisatie zet je klaar met:

```
SEED_ORG_NAME="Naam van de klant" SEED_ADMIN_NAME="Naam" SEED_ADMIN_EMAIL="mail@klant.nl" npm run db:seed
```

De klant past daarna zelf naam, logo, kleuren, types en vragen aan bij Instellingen. Let op: de startvragen komen nu uit `src/data/brownies-vragen.ts`. Voor een klant pas je die eerst aan, of de klant doet het na het inloggen.

## Techniek

Next.js 16, Drizzle met Postgres (Neon), mail via Brevo, dagelijkse taak via Vercel Cron (`vercel.json`). Code in `src/`:
- `src/db/schema.ts`: alle tabellen.
- `src/lib/access.ts`: de regels wie wat mag zien.
- `src/lib/crypto.ts`: versleuteling en inlogcodes.
- `src/lib/talks.ts`: gesprekken, momenten en antwoorden.
- `src/app/mijn`: schermen voor medewerkers. `src/app/beheer`: schermen voor beheerder en stagebegeleider.
- `src/app/api/herinneringen`: de dagelijkse taak.
