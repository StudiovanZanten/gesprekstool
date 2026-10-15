import { Kop, orgStyle } from '@/components/Kop'
import { getOrg, requireStaff } from '@/lib/auth'

export default async function BeheerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff()
  const org = await getOrg(user.orgId)
  return (
    <div style={orgStyle(org)}>
      <Kop org={org} user={user} />
      {children}
    </div>
  )
}
