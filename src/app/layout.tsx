import type { Metadata, Viewport } from 'next'
import { Inter, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'

/**
 * Typography, per the Brand Identity Guide:
 *   Primary   Inter          - UI, dashboards, websites, applications
 *   Secondary IBM Plex Sans  - technical and developer-facing materials
 *   Fallback  Arial          - declared in the token in globals.css
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'AfriMesh — Where Commerce Connects',
    template: '%s · AfriMesh',
  },
  description:
    "Africa's proximity commerce and payment infrastructure. Find what you need from trusted sellers nearby, pay securely, and get it delivered.",
  applicationName: 'AfriMesh Commerce',
}

export const viewport: Viewport = {
  themeColor: '#2d4a3a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  )
}
