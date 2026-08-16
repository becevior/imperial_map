import LeaguePage from '@/components/LeaguePage'
import { getLeague } from '@/lib/leagues'

export default function NflPage() {
  return <LeaguePage league={getLeague('nfl')} />
}
