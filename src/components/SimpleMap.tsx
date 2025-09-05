'use client'

import { useEffect, useState } from 'react'
import type { Team } from '@/types'

interface SimpleMapProps {
  className?: string
}

export default function SimpleMap({ className = '' }: SimpleMapProps) {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadTime, setLoadTime] = useState<string>('')

  useEffect(() => {
    const startTime = Date.now()
    console.log('SimpleMap: Loading teams...')
    
    fetch('/api/teams')
      .then(response => {
        if (!response.ok) throw new Error('Failed to load teams')
        return response.json()
      })
      .then(data => {
        console.log('SimpleMap: Teams loaded:', data.teams?.length || 0)
        setTeams(data.teams || [])
        setLoading(false)
        setLoadTime(`${Date.now() - startTime}ms`)
      })
      .catch(err => {
        console.error('SimpleMap: Error loading teams:', err)
        setError('Failed to load team data')
        setLoading(false)
      })
  }, [])

  const mockCounties = [
    { name: 'Autauga County, AL', team: 'alabama', population: 58805 },
    { name: 'Baldwin County, AL', team: 'auburn', population: 223234 },
    { name: 'Los Angeles County, CA', team: 'usc', population: 9829544 },
    { name: 'Harris County, TX', team: 'texas', population: 4731145 },
    { name: 'Cook County, IL', team: 'notre-dame', population: 5150233 }
  ]

  return (
    <div className={`relative ${className}`}>
      <div 
        className="w-full h-full rounded-lg overflow-hidden bg-gradient-to-br from-blue-50 to-green-50 flex flex-col items-center justify-center"
        style={{ minHeight: '400px' }}
      >
        <div className="text-center p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            🗺️ College Football Imperial Map
          </h2>
          <p className="text-gray-600 mb-6">
            Simplified view - Map component testing
          </p>
          
          {loading && (
            <div className="text-blue-600">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mr-2"></div>
              Loading teams data...
            </div>
          )}
          
          {error && (
            <div className="text-red-600 bg-red-50 p-3 rounded">
              ❌ {error}
            </div>
          )}
          
          {!loading && !error && (
            <div className="bg-white rounded-lg p-4 shadow-lg">
              <h3 className="font-semibold text-green-600 mb-2">
                ✅ Data loaded successfully in {loadTime}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {teams.length} teams loaded
              </p>
              
              <div className="space-y-2">
                <h4 className="font-medium text-gray-800">Sample Counties:</h4>
                {mockCounties.map((county, index) => {
                  const team = teams.find(t => t.id === county.team)
                  return (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span>{county.name}</span>
                      <div className="flex items-center">
                        <div 
                          className="w-3 h-3 rounded mr-2"
                          style={{ backgroundColor: team?.colorPrimary || '#666' }}
                        />
                        <span className="font-medium">{team?.shortName || 'Unknown'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="absolute bottom-4 right-4 bg-white bg-opacity-90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg">
        <p className="text-xs text-gray-500">
          Status: {loading ? 'Loading...' : error ? 'Error' : 'Ready'}
        </p>
      </div>
    </div>
  )
}