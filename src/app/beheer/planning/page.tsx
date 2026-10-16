import { and, asc, eq, gt, isNull } from 'drizzle-orm'
import { db, employeeTypes, organisations, slots, talkWeeks, talks, users } from '@/db'
import { requireStaff } from '@/lib/auth'
import { DatumMetWeek } from '@/components/DatumMetWeek'
import { addDays, fmtDate, fmtTime, isoWeek, mondayOfWeek, TZ, roundLabel, weekLabel, weeksInYear } from '@/lib/dates'
import { stelWekenIn, verwijderMoment, zetMomentenOpen } from './actions'

export default async function Planning({ searchParams }: { searchParams: Promise<{ melding?: string; n?: string }> }) {
  const sp = await searchParams
  const me = await requireStaff()
  const isAdmin = me.role === 'beheerder'
  const [org] = await db.select().from(organisations).where(eq(organisations.id, me.orgId))
  const { year } = isoWeek(new Date())
  const types = (await db.select().from(employeeTypes).where(eq(employeeTypes.orgId, me.orgId)).orderBy(asc(employeeTypes.position))).filter((t) => t.rhythm === 'weken')
  const weeks = await db.select().from(talkWeeks).where(eq(talkWeeks.orgId, me.orgId)).orderBy(asc(talkWeeks.year), asc(talkWeeks.week))
  const mine = await db
    .select({ slot: slots, talk: talks, emp: users })
    .from(slots)
    .leftJoin(talks, eq(talks.id, slots.talkId))
    .leftJoin(users, eq(users.id, talks.employeeId))
    .where(and(eq(slots.hostId, me.id), gt(slots.startsAt, new Date())))
    .orderBy(asc(slots.startsAt))
  // Momenten per week en per dag.
  const byWeek = new Map<string, { label: string; days: Map<string, typeof mine> }>()
  for (const r of mine) {
    const day = r.slot.startsAt.toLocaleDateString('sv-SE', { timeZone: TZ })
    const w = isoWeek(new Date(day + 'T12:00:00Z'))
    const key = `${w.year}-${String(w.week).padStart(2, '0')}`
    if (!byWeek.has(key)) byWeek.set(key, { label: weekLabel(w.year, w.week), days: new Map() })
    const days = byWeek.get(key)!.days
    days.set(day, [...(days.get(day) ?? []), r])
  }
  const shortDate = (s: string) => new Date(s + 'T12:00:00Z').toLocaleDateString('nl-NL', { timeZone: TZ, day: 'numeric', month: 'short' })
  const now = isoWeek(new Date())
  const upcoming = weeks.filter((w) => w.year > now.year || (w.year === now.year && (w.weekEnd ?? w.week) >= now.week))
  const weekTypes = (y: number, w: number) =>
    weeks.filter((x) => x.year === y && x.week <= w && w <= (x.weekEnd ?? x.week)).map((x) => types.find((t) => t.id === x.typeId)?.name).filter((n): n is string => !!n)
  // Vrije momenten per gespreksronde, zodat je ziet of medewerkers iets kunnen kiezen.
  const freeAll = await db
    .select({ startsAt: slots.startsAt })
    .from(slots)
    .where(and(eq(slots.orgId, me.orgId), isNull(slots.talkId), gt(slots.startsAt, new Date())))
  const freeIn = (r: (typeof weeks)[number]) => {
    const from = mondayOfWeek(r.year, r.week)
    const to = addDays(mondayOfWeek(r.year, r.weekEnd ?? r.week), 7)
    return freeAll.filter((f) => {
      const d = f.startsAt.toLocaleDateString('sv-SE', { timeZone: TZ })
      return d >= from && d < to
    }).length
  }
  const upcomingUnique = [...new Map(upcoming.map((w) => [`${w.year}-${w.week}`, w])).values()]

  return (
    <main>
      <h1>Planning</h1>
      {sp.melding === 'bewaard' && <div className="melding goed">Gespreksrondes bewaard.</div>}
      {sp.melding === 'bewaard-deels' && <div className="melding">Bewaard. Een ronde waarin al een moment gekozen of iets ingevuld is, is blijven staan.</div>}
      {sp.melding === 'weken-fout' && <div className="melding fout">Controleer de weeknummers: de laatste week mag niet voor de eerste liggen.</div>}
      {sp.melding === 'weken-overlap' && <div className="melding fout">Twee gesprekken overlappen elkaar. Laat elk gesprek in eigen weken vallen.</div>}
      {sp.melding === 'open' && <div className="melding goed">{sp.n} momenten opengezet.</div>}
      {sp.melding === 'fout' && <div className="melding fout">Kies een eerste dag, een laatste dag die niet eerder is, en een begin en eindtijd met genoeg ruimte voor minstens één gesprek.</div>}
      {sp.melding === 'te-lang' && <div className="melding fout">Kies een periode van hooguit twee maanden.</div>}
      {sp.melding === 'geen' && <div className="melding">Er zijn geen nieuwe momenten bijgekomen. Kijk of er weekdagen aangevinkt zijn, of dat die tijden al openstaan.</div>}

      {isAdmin && (
        <section className="kaart">
          <h2>Gespreksrondes</h2>
          <p className="zacht klein">
            Kies per gesprek een periode van een of meer weken. In die periode kiest de medewerker zelf een moment, en het telt als één gesprek.
            Drie weken voor de eerste week krijgen medewerkers een uitnodiging. Laat een rij leeg om hem weg te halen.
          </p>
          {types.map((t) => (
            <div key={t.id} className="deel">
              <h3>{t.name}</h3>
              <div className="raster">
                {[year, year + 1].map((y) => {
                  const rounds = weeks.filter((w) => w.typeId === t.id && w.year === y)
                  const rows = Math.min(6, Math.max(2, rounds.length + 1))
                  return (
                    <form key={y} action={stelWekenIn.bind(null, t.id, y)} className="kaart tint" style={{ gap: 10 }}>
                      <strong>{y}</strong>
                      {Array.from({ length: rows }, (_, i) => {
                        const r = rounds[i]
                        return (
                          <div key={i} className="ronde">
                            <span className="ronde-naam">Gesprek {i + 1}</span>
                            <label className="ronde-veld">
                              <span>van week</span>
                              <input name="van" type="number" min={1} max={53} inputMode="numeric" defaultValue={r?.week ?? ''} aria-label={`Gesprek ${i + 1} ${y}, van week`} />
                            </label>
                            <label className="ronde-veld">
                              <span>tot en met</span>
                              <input name="tot" type="number" min={1} max={53} inputMode="numeric" defaultValue={r?.weekEnd ?? r?.week ?? ''} aria-label={`Gesprek ${i + 1} ${y}, tot en met week`} />
                            </label>
                            {r && (
                              <span className="hint ronde-uitleg">
                                {roundLabel(r.year, r.week, r.weekEnd)}.{' '}
                                {freeIn(r) ? `${freeIn(r)} vrije momenten.` : <strong>Nog geen vrije momenten, medewerkers kunnen nog niets kiezen.</strong>}
                              </span>
                            )}
                          </div>
                        )
                      })}
                      <div><button className="knop licht klein">Bewaren</button></div>
                    </form>
                  )
                })}
              </div>
            </div>
          ))}
          <details>
            <summary className="klein">Weeknummers bekijken</summary>
            <div className="raster" style={{ marginTop: 12 }}>
              {[year, year + 1].map((y) => (
                <div key={y} className="stapel">
                  <strong>{y}</strong>
                  <table className="tabel klein">
                    <tbody>
                      {Array.from({ length: weeksInYear(y) }, (_, i) => i + 1)
                        .filter((w) => y > now.year || w >= now.week)
                        .map((w) => {
                          const mon = mondayOfWeek(y, w)
                          const types = weekTypes(y, w)
                          return (
                            <tr key={w}>
                              <td><strong>Week {w}</strong></td>
                              <td>{shortDate(mon)} tot {shortDate(addDays(mon, 6))}</td>
                              <td>{types.map((n) => <span key={n} className="pil goed" style={{ marginRight: 4 }}>{n}</span>)}</td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </details>
        </section>
      )}

      <section className="kaart">
        <h2>Momenten openzetten</h2>
        <p className="zacht klein">
          Kies een dag, of een eerste en laatste dag voor een langere periode, en de tijd waarop je kunt. De tool maakt er blokken van {org.talkMinutes} minuten van.
          {isAdmin && upcomingUnique.length > 0 && ` Komende gespreksrondes: ${upcomingUnique.slice(0, 3).map((w) => roundLabel(w.year, w.week, w.weekEnd)).join(', ')}.`}
        </p>
        <form action={zetMomentenOpen} className="stapel" style={{ gap: 16 }}>
          <div className="velden twee">
            <DatumMetWeek id="datum" name="datum" label="Eerste dag" required />
            <DatumMetWeek id="totdatum" name="totdatum" label="Laatste dag (mag leeg bij één dag)" />
            <div className="veld"><label htmlFor="van">Van</label><input id="van" name="van" type="time" required defaultValue="10:00" /></div>
            <div className="veld"><label htmlFor="tot">Tot</label><input id="tot" name="tot" type="time" required defaultValue="14:00" /></div>
          </div>
          <fieldset className="dagen">
            <legend>Op welke dagen? (bij meerdere dagen)</legend>
            {['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((d, i) => (
              <label key={d} className="dag">
                <input type="checkbox" name="dag" value={i + 1} defaultChecked={i < 5} />
                <span>{d}</span>
              </label>
            ))}
          </fieldset>
          <div><button className="knop">Openzetten</button></div>
        </form>
      </section>

      <section className="kaart">
        <h2>Mijn momenten</h2>
        {byWeek.size ? (
          [...byWeek.entries()].map(([key, { label, days }]) => (
            <div key={key} className="stapel">
              <h3 style={{ margin: '6px 0 0' }}>{label}</h3>
              {[...days.entries()].map(([day, list]) => (
                <div key={day} className="stapel">
                  <strong>{fmtDate(day)}</strong>
                  <div className="lijst">
                    {list.map(({ slot, emp }) => (
                      <div key={slot.id} className="rij tussen">
                        <span>{fmtTime(slot.startsAt)} tot {fmtTime(slot.endsAt)}</span>
                        {emp ? (
                          <span className="pil goed">{emp.name}</span>
                        ) : (
                          <form action={verwijderMoment.bind(null, slot.id)} className="rij">
                            <span className="pil">Vrij</span>
                            <button className="knop licht klein">Weghalen</button>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))
        ) : (
          <p className="zacht">Je hebt nog geen momenten openstaan.</p>
        )}
      </section>
    </main>
  )
}
