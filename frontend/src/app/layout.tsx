import type { Metadata } from 'next'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'

import { ThemeProvider } from '@/components/ThemeContext'

export const metadata: Metadata = {
  title: 'College Football Imperial Map',
  description: 'Interactive territory map showing college football imperial conquests',
}

// Runs before first paint so the skin applies without a flash. An explicitly
// chosen skin sticks; otherwise (first visit or "random" mode) roll one.
const themeInitScript = `try{var s=['tecmo','teletext','ledger','geocities','classic'];var t=localStorage.getItem('imperial-map-theme');document.documentElement.dataset.theme=s.indexOf(t)>=0?t:s[Math.floor(Math.random()*s.length)]}catch(e){document.documentElement.dataset.theme='tecmo'}`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-theme="tecmo" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
