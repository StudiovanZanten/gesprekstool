'use client'
import { STATUSSEN } from '@/lib/questions'

// Keuzelijst voor de voortgang van een afspraak. Bewaart meteen bij het kiezen.
export function StatusKeuze({ action, status, label }: { action: (fd: FormData) => void | Promise<void>; status: string; label: string }) {
  return (
    <form action={action}>
      <select name="status" defaultValue={status} aria-label={label} onChange={(e) => e.currentTarget.form?.requestSubmit()} style={{ minWidth: 190 }}>
        {Object.entries(STATUSSEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </form>
  )
}
