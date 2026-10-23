import { redirect } from 'next/navigation'
import { Kop, orgStyle } from '@/components/Kop'
import { getOrg, requireUser } from '@/lib/auth'

export default async function MijnLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (user.role !== 'medewerker') redirect('/beheer')
  const org = await getOrg(user.orgId)
  return (
    <div style={orgStyle(org)}>
      <Kop org={org} user={user} />
      {children}
    </div>
  )
}
