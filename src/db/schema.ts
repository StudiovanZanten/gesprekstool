import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Velden die eindigen op "Enc" bevatten versleutelde tekst (zie src/lib/crypto.ts).

export const roleEnum = pgEnum('rol', ['beheerder', 'begeleider', 'medewerker'])
export const rhythmEnum = pgEnum('gespreksritme', ['weken', 'stage'])
export const questionnaireKindEnum = pgEnum('soort_vragenlijst', ['gesprek', 'week'])
export const answerTypeEnum = pgEnum('soort_antwoord', ['tekst', 'smiley', 'keuze'])
export const talkStatusEnum = pgEnum('gespreksstatus', ['open', 'gepland', 'gedeeld', 'gevoerd'])

const id = () => uuid('id').primaryKey().defaultRandom()
const created = () => timestamp('aangemaakt', { withTimezone: true }).notNull().defaultNow()

export const organisations = pgTable('organisaties', {
  id: id(),
  name: text('naam').notNull(),
  logoUrl: text('logo_url'),
  colorPrimary: text('kleur_hoofd').notNull().default('#5a3426'),
  colorAccent: text('kleur_accent').notNull().default('#b98b3e'),
  retentionMonths: integer('bewaartermijn_maanden').notNull().default(24),
  talkMinutes: integer('gespreksduur_minuten').notNull().default(30),
  // Kiest iemand een moment, dan is die hele dag vol voor die gespreksvoerder.
  onePerDay: boolean('een_gesprek_per_dag').notNull().default(true),
  weeklyQuestionnaireId: uuid('weekcheck_vragenlijst_id'),
  // Het vaste overleg: dag van de week (1 is maandag), begintijd en de vaste agendapunten met eigenaar (JSON lijst).
  meetingWeekday: integer('vergaderdag').notNull().default(2),
  meetingTime: text('vergadertijd').notNull().default('10:00'),
  meetingFixedItems: text('vaste_agendapunten'),
  createdAt: created(),
})

export const questionnaires = pgTable('vragenlijsten', {
  id: id(),
  orgId: uuid('organisatie_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  name: text('naam').notNull(),
  kind: questionnaireKindEnum('soort').notNull(),
  createdAt: created(),
})

export const questions = pgTable(
  'vragen',
  {
    id: id(),
    questionnaireId: uuid('vragenlijst_id').notNull().references(() => questionnaires.id, { onDelete: 'cascade' }),
    position: integer('volgorde').notNull(),
    text: text('tekst').notNull(),
    answerType: answerTypeEnum('soort_antwoord').notNull(),
    topic: text('onderwerp'),
    allowNote: boolean('toelichting_mogelijk').notNull().default(false),
    showPrevAgreements: boolean('toon_vorige_afspraken').notNull().default(false),
    helpSignal: boolean('hulp_seintje').notNull().default(false),
    isGoal: boolean('doelvraag').notNull().default(false),
    // Onderdeel A, B of C van een gesprek (leeg bij de weekcheck).
    section: text('onderdeel'),
    // Bij meerkeuze: de keuzes als JSON lijst. "Anders, namelijk" komt er altijd vanzelf bij.
    options: text('keuzes'),
    // Vanaf dit moment is de smiley altijd zichtbaar voor de leidinggevende. De uitleg blijft privé tot hij gedeeld wordt.
    // Antwoorden van daarvoor blijven privé, want die zijn gegeven toen dat nog zo was.
    smileyVisibleFrom: timestamp('smiley_zichtbaar_vanaf', { withTimezone: true }),
    active: boolean('actief').notNull().default(true),
  },
  (t) => [index('vragen_lijst_idx').on(t.questionnaireId)],
)

export const employeeTypes = pgTable('types_medewerker', {
  id: id(),
  orgId: uuid('organisatie_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  name: text('naam').notNull(),
  rhythm: rhythmEnum('ritme').notNull(),
  questionnaireId: uuid('vragenlijst_id').references(() => questionnaires.id),
  position: integer('volgorde').notNull().default(0),
})

export const users = pgTable(
  'gebruikers',
  {
    id: id(),
    orgId: uuid('organisatie_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
    name: text('naam').notNull(),
    email: text('email'),
    role: roleEnum('rol').notNull(),
    typeId: uuid('type_id').references(() => employeeTypes.id),
    supervisorId: uuid('stagebegeleider_id'),
    internshipStart: date('stage_start'),
    internshipEnd: date('stage_einde'),
    active: boolean('actief').notNull().default(true),
    leftAt: timestamp('uit_dienst', { withTimezone: true }),
    loginCodeHash: text('inlogcode_hash'),
    // Doet mee aan het wekelijkse overleg, met een eigen mailadres voor de actiepunten (leeg: het gewone mailadres).
    inMeeting: boolean('in_overleg').notNull().default(false),
    meetingEmail: text('mail_overleg'),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('gebruikers_email_uniek').on(t.email),
    uniqueIndex('gebruikers_code_uniek').on(t.loginCodeHash),
    index('gebruikers_org_idx').on(t.orgId),
  ],
)

export const talkWeeks = pgTable(
  'gespreksweken',
  {
    id: id(),
    orgId: uuid('organisatie_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
    typeId: uuid('type_id').notNull().references(() => employeeTypes.id, { onDelete: 'cascade' }),
    year: integer('jaar').notNull(),
    // Een gespreksronde loopt van week tot en met weekEnd (leeg betekent één week).
    week: integer('week').notNull(),
    weekEnd: integer('tot_week'),
  },
  (t) => [uniqueIndex('gespreksweek_uniek').on(t.typeId, t.year, t.week)],
)

export const talks = pgTable(
  'gesprekken',
  {
    id: id(),
    orgId: uuid('organisatie_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
    employeeId: uuid('medewerker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    hostId: uuid('gespreksvoerder_id').references(() => users.id),
    talkWeekId: uuid('gespreksweek_id').references(() => talkWeeks.id, { onDelete: 'set null' }),
    label: text('naam').notNull(),
    status: talkStatusEnum('status').notNull().default('open'),
    goodEnc: text('wat_gaat_goed'),
    attentionEnc: text('wat_vraagt_aandacht'),
    sharedAt: timestamp('gedeeld_op', { withTimezone: true }),
    heldAt: timestamp('gevoerd_op', { withTimezone: true }),
    // Voorbereiding van de leidinggevende (versleutelde JSON). Niet zichtbaar voor de medewerker.
    hostPrepEnc: text('voorbereiding_leiding'),
    topicsEnc: text('onderwerpen'),
    goalsEnc: text('ontwikkeldoelen'),
    nextTalkDate: date('volgend_gesprek'),
    reportById: uuid('verslag_door'),
    // Bevestigen betekent: ontvangen en gelezen. Niet: akkoord.
    employeeConfirmedAt: timestamp('gelezen_medewerker', { withTimezone: true }),
    employeeReactionEnc: text('reactie_medewerker'),
    hostConfirmedAt: timestamp('gelezen_leiding', { withTimezone: true }),
    hostConfirmedBy: uuid('gelezen_leiding_door'),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('gesprek_per_week_uniek').on(t.employeeId, t.talkWeekId),
    index('gesprekken_org_idx').on(t.orgId),
  ],
)

export const slots = pgTable(
  'momenten',
  {
    id: id(),
    orgId: uuid('organisatie_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
    hostId: uuid('gespreksvoerder_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    startsAt: timestamp('begin', { withTimezone: true }).notNull(),
    endsAt: timestamp('einde', { withTimezone: true }).notNull(),
    talkId: uuid('gesprek_id').references(() => talks.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('moment_gesprek_uniek').on(t.talkId), index('momenten_begin_idx').on(t.orgId, t.startsAt)],
)

export const agreements = pgTable('afspraken', {
  id: id(),
  talkId: uuid('gesprek_id').notNull().references(() => talks.id, { onDelete: 'cascade' }),
  textEnc: text('afspraak').notNull(),
  reviewDate: date('terugkijkdatum'),
  // Wie zorgt ervoor: medewerker, leidinggevende of samen.
  owner: text('verantwoordelijke'),
  // nog_niet, bezig of gelukt. "done" blijft gelijk aan status gelukt.
  status: text('status').notNull().default('nog_niet'),
  done: boolean('gelukt').notNull().default(false),
  doneAt: timestamp('gelukt_op', { withTimezone: true }),
  createdAt: created(),
})

export const weekchecks = pgTable(
  'weekchecks',
  {
    id: id(),
    orgId: uuid('organisatie_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
    userId: uuid('medewerker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    year: integer('jaar').notNull(),
    week: integer('week').notNull(),
    helpRequested: boolean('hulp_gevraagd').notNull().default(false),
    helpHandledAt: timestamp('hulp_opgepakt', { withTimezone: true }),
    helpHandledBy: uuid('hulp_opgepakt_door'),
    readAt: timestamp('gelezen_op', { withTimezone: true }),
    readBy: uuid('gelezen_door'),
    // Keuze van de medewerker om de weekcheck te delen. Leeg: nog nooit gekozen.
    shared: boolean('gedeeld'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('weekcheck_uniek').on(t.userId, t.year, t.week)],
)

export const answers = pgTable(
  'antwoorden',
  {
    id: id(),
    orgId: uuid('organisatie_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
    userId: uuid('medewerker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    talkId: uuid('gesprek_id').references(() => talks.id, { onDelete: 'cascade' }),
    weekcheckId: uuid('weekcheck_id').references(() => weekchecks.id, { onDelete: 'cascade' }),
    questionId: uuid('vraag_id').references(() => questions.id, { onDelete: 'set null' }),
    questionText: text('vraagtekst').notNull(),
    answerType: answerTypeEnum('soort_antwoord').notNull(),
    position: integer('volgorde').notNull(),
    valueEnc: text('antwoord'),
    smiley: integer('smiley'),
    noteEnc: text('toelichting'),
    shared: boolean('gedeeld').notNull().default(false),
    updatedAt: timestamp('bijgewerkt', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('antwoorden_gebruiker_idx').on(t.userId),
    uniqueIndex('antwoord_gesprek_uniek').on(t.talkId, t.questionId),
    uniqueIndex('antwoord_week_uniek').on(t.weekcheckId, t.questionId),
  ],
)

export const accessLog = pgTable('inzagelog', {
  id: id(),
  orgId: uuid('organisatie_id').notNull(),
  viewerId: uuid('bekeken_door').notNull(),
  subjectId: uuid('medewerker_id').notNull(),
  what: text('wat').notNull(),
  at: created(),
})

export const reminders = pgTable(
  'herinneringen',
  {
    id: id(),
    userId: uuid('gebruiker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('soort').notNull(),
    ref: text('verwijzing').notNull(),
    sentAt: created(),
  },
  (t) => [uniqueIndex('herinnering_uniek').on(t.userId, t.kind, t.ref)],
)

export const loginTokens = pgTable('inloglinks', {
  id: id(),
  userId: uuid('gebruiker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('verloopt', { withTimezone: true }).notNull(),
  usedAt: timestamp('gebruikt', { withTimezone: true }),
})

export const sessions = pgTable('sessies', {
  id: id(),
  userId: uuid('gebruiker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('verloopt', { withTimezone: true }).notNull(),
})

export const loginAttempts = pgTable('inlogpogingen', {
  id: id(),
  key: text('sleutel').notNull(),
  at: created(),
})

// Het wekelijkse overleg. Iedereen zet punten op de agenda, de leiding maakt de notulen.
export const meetings = pgTable(
  'vergaderingen',
  {
    id: id(),
    orgId: uuid('organisatie_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
    date: date('datum').notNull(),
    time: text('tijd').notNull(),
    // Wie er waren (JSON lijst met gebruiker ids).
    present: text('aanwezig'),
    // Vergadermodus: het punt dat nu aan de beurt is. Leeg: het overleg is nog niet begonnen.
    currentItemId: uuid('huidig_punt'),
    minuteTakerId: uuid('notulist'),
    finishedAt: timestamp('afgerond_op', { withTimezone: true }),
    finishedBy: uuid('afgerond_door'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('vergadering_datum_uniek').on(t.orgId, t.date)],
)

export const meetingItems = pgTable(
  'agendapunten',
  {
    id: id(),
    meetingId: uuid('vergadering_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
    position: integer('volgorde').notNull(),
    titleEnc: text('titel').notNull(),
    explanationEnc: text('toelichting'),
    addedBy: uuid('ingebracht_door').references(() => users.id, { onDelete: 'set null' }),
    owner: text('eigenaar'),
    fixed: boolean('vast').notNull().default(false),
    notesEnc: text('notulen'),
    decisionEnc: text('besluit'),
  },
  (t) => [index('agendapunten_vergadering_idx').on(t.meetingId)],
)

// Onderwerpen die collega's vooraf inbrengen bij een agendapunt. De voorzitter zet ze op de agenda of niet.
export const meetingTopics = pgTable(
  'onderwerpen',
  {
    id: id(),
    meetingId: uuid('vergadering_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
    itemId: uuid('agendapunt_id').references(() => meetingItems.id, { onDelete: 'set null' }),
    titleEnc: text('onderwerp').notNull(),
    explanationEnc: text('toelichting'),
    addedBy: uuid('ingebracht_door').references(() => users.id, { onDelete: 'set null' }),
    // verzoek, akkoord of niet
    status: text('status').notNull().default('verzoek'),
    createdAt: created(),
  },
  (t) => [index('onderwerpen_vergadering_idx').on(t.meetingId)],
)

export const actionItems = pgTable(
  'actiepunten',
  {
    id: id(),
    orgId: uuid('organisatie_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
    meetingId: uuid('vergadering_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
    itemId: uuid('agendapunt_id').references(() => meetingItems.id, { onDelete: 'set null' }),
    textEnc: text('actie').notNull(),
    ownerId: uuid('wie').references(() => users.id, { onDelete: 'set null' }),
    dueDate: date('wanneer'),
    doneAt: timestamp('klaar_op', { withTimezone: true }),
    doneBy: uuid('klaar_door'),
    createdAt: created(),
  },
  (t) => [index('actiepunten_org_idx').on(t.orgId)],
)

export type Meeting = typeof meetings.$inferSelect
export type User = typeof users.$inferSelect
export type Organisation = typeof organisations.$inferSelect
export type Question = typeof questions.$inferSelect
export type Talk = typeof talks.$inferSelect
