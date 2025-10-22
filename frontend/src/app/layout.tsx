import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'College Football Imperial Map',
  description: 'Interactive territory map showing college football imperial conquests',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
