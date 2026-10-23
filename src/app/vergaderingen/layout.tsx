import { redirect } from 'next/navigation'
import { Kop, orgStyle } from '@/components/Kop'
import { getOrg, requireUser } from '@/lib/auth'
import { inTeam } from '@/lib/meetings'

// Alleen het team van het overleg (bij Instellingen gekozen) en de beheerder kunnen hier komen.
export default async function VergaderingenLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (!inTeam(user)) redirect('/')
  const org = await getOrg(user.orgId)
  return (
    <div style={orgStyle(org)}>
      <Kop org={org} user={user} />
      {children}
    </div>
  )
}
