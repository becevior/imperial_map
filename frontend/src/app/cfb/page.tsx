import LeaguePage from '@/components/LeaguePage'
import { getLeague } from '@/lib/leagues'

export default function CollegeFootballPage() {
  return <LeaguePage league={getLeague('cfb')} />
}
