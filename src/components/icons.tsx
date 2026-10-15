// Eenvoudige pictogrammen, getekend met lijnen zodat ze in elke kleur werken.
const base = { width: 32, height: 32, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const IconWeek = () => (
  <svg {...base}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m9 15 2 2 4-4" /></svg>
)
export const IconTalk = () => (
  <svg {...base}><path d="M4 5h11a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H9l-4 3v-3a3 3 0 0 1-1-2V8a3 3 0 0 1 3-3" /><path d="M20 9a2 2 0 0 1 1 2v5a2 2 0 0 1-2 2v2l-3-2" /></svg>
)
export const IconBack = () => (
  <svg {...base}><path d="M12 8v4l3 2" /><path d="M3.5 12A8.5 8.5 0 1 0 6 6" /><path d="M3 3v4h4" /></svg>
)
export const IconSpeaker = () => (
  <svg {...base} width={18} height={18}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" /></svg>
)
