import { SMILEYS } from '@/lib/talks'

export function Antwoord({ a }: { a: { answerType: string; value: string; smiley: number | null; note: string } }) {
  const s = SMILEYS.find((x) => x.v === a.smiley)
  return (
    <span>
      {a.answerType === 'smiley' ? (s ? `${s.emoji} ${s.label}` : 'Geen smiley gekozen') : a.value || 'Niet ingevuld'}
      {a.note ? `. ${a.note}` : ''}
    </span>
  )
}
