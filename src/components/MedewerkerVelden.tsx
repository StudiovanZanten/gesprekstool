import type { User } from '@/db'

type T = { id: string; name: string; rhythm: string }

export function MedewerkerVelden({ u, types, begeleiders }: { u?: User; types: T[]; begeleiders: User[] }) {
  return (
    <>
      <div className="velden twee">
        <div className="veld">
          <label htmlFor="naam">Naam</label>
          <input id="naam" name="naam" type="text" required defaultValue={u?.name} />
        </div>
        <div className="veld">
          <label htmlFor="email">Mailadres</label>
          <input id="email" name="email" type="email" defaultValue={u?.email ?? ''} />
          <span className="hint">Geen mailadres? Dan logt iemand in met een inlogcode.</span>
        </div>
        <div className="veld">
          <label htmlFor="rol">Rol</label>
          <select id="rol" name="rol" defaultValue={u?.role ?? 'medewerker'}>
            <option value="medewerker">Medewerker</option>
            <option value="begeleider">Stagebegeleider</option>
            <option value="beheerder">Beheerder</option>
          </select>
        </div>
        <div className="veld">
          <label htmlFor="type">Type medewerker</label>
          <select id="type" name="type" defaultValue={u?.typeId ?? ''}>
            <option value="">Kies een type</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <div className="deel">
        <h3>Alleen voor stagiaires</h3>
        <p className="zacht klein">Laat leeg bij vaste medewerkers en oproepkrachten.</p>
        <div className="velden drie">
          <div className="veld">
            <label htmlFor="begeleider">Stagebegeleider</label>
            <select id="begeleider" name="begeleider" defaultValue={u?.supervisorId ?? ''}>
              <option value="">Geen</option>
              {begeleiders.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="veld">
            <label htmlFor="stage_start">Start stage</label>
            <input id="stage_start" name="stage_start" type="date" defaultValue={u?.internshipStart ?? ''} />
          </div>
          <div className="veld">
            <label htmlFor="stage_einde">Einde stage</label>
            <input id="stage_einde" name="stage_einde" type="date" defaultValue={u?.internshipEnd ?? ''} />
          </div>
        </div>
      </div>
    </>
  )
}
