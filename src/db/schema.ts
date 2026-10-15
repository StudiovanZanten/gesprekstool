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
export const answerTypeEnum = pgEnum('soort_antwoord', ['tekst', 'smiley'])
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
  weeklyQuestionnaireId: uuid('weekcheck_vragenlijst_id'),
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

export type User = typeof users.$inferSelect
export type Organisation = typeof organisations.$inferSelect
export type Question = typeof questions.$inferSelect
export type Talk = typeof talks.$inferSelect
