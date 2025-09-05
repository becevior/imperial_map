import Map from '@/components/Map'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-100 to-white">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            College Football Imperial Map
          </h1>
          <p className="text-lg text-gray-600">
            Interactive territory map showing college football imperial conquests
          </p>
        </header>
        
        <div className="bg-white rounded-lg shadow-lg p-6">
          <Map className="h-96" />
        </div>
        
        <footer className="mt-8 text-center text-sm text-gray-500">
          <p>Built with Next.js, MapLibre GL JS, and real-time college football data</p>
        </footer>
      </div>
    </main>
  )
}