import Link from 'next/link'
import { Gevoel } from '@/components/Gevoel'
import { Profiel } from '@/components/Profiel'
import { requireUser } from '@/lib/auth'
import { profileData } from '@/lib/profile'

export default async function MijnProfiel() {
  const user = await requireUser()
  const data = await profileData(user.id, false)
  return (
    <main>
      <h1>Mijn profiel</h1>
      <p className="zacht">Je ontwikkelplan, je doelen en al je gesprekken. Je leidinggevende ziet de afspraken en verslagen ook.</p>
      <Profiel data={data} zelf />
      <Gevoel employeeId={user.id} since={null} zelf titel="Mijn weken" />
      <p><Link href="/mijn/terugkijken">Al mijn antwoorden en weekchecks terugkijken</Link></p>
    </main>
  )
}
