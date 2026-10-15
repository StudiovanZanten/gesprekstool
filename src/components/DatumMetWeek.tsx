'use client'
import { useState } from 'react'

// ISO weeknummer van een datumtekst JJJJ-MM-DD.
function weekVan(s: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const t = new Date(s + 'T12:00:00Z')
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// Datumveld dat eronder laat zien in welke week de gekozen dag valt.
export function DatumMetWeek({ id, name, label, defaultValue = '', required }: { id: string; name: string; label: string; defaultValue?: string; required?: boolean }) {
  const [value, setValue] = useState(defaultValue)
  const week = weekVan(value)
  return (
    <div className="veld">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type="date" required={required} value={value} onChange={(e) => setValue(e.target.value)} />
      <span className="hint">{week ? `Week ${week}` : 'Kies een dag'}</span>
    </div>
  )
}
