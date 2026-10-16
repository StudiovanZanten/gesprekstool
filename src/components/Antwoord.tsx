import { SMILEYS } from '@/lib/talks'
import { ANDERS } from '@/lib/questions'

export function Antwoord({ a }: { a: { answerType: string; value: string; smiley: number | null; note: string } }) {
  const s = SMILEYS.find((x) => x.v === a.smiley)
  if (a.answerType === 'keuze') {
    if (!a.value) return <span>Niet ingevuld</span>
    return <span>{a.value === ANDERS ? `Anders: ${a.note || 'geen uitleg'}` : a.value}</span>
  }
  return (
    <span>
      {a.answerType === 'smiley' ? (s ? `${s.emoji} ${s.label}` : 'Geen smiley gekozen') : a.value || 'Niet ingevuld'}
      {a.note ? `. ${a.note}` : ''}
    </span>
  )
}
