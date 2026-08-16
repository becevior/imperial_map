import LeaguePage from '@/components/LeaguePage'
import { getLeague } from '@/lib/leagues'

export default async function Home() {
  return <LeaguePage league={getLeague('cfb')} />
}
