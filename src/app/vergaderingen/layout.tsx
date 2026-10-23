import { redirect } from 'next/navigation'
import { Kop, orgStyle } from '@/components/Kop'
import { isIntern } from '@/lib/access'
import { getOrg, requireUser } from '@/lib/auth'

export default async function VergaderingenLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (await isIntern(user)) redirect('/mijn')
  const org = await getOrg(user.orgId)
  return (
    <div style={orgStyle(org)}>
      <Kop org={org} user={user} />
      {children}
    </div>
  )
}
