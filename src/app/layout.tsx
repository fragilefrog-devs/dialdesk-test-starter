import type { Metadata, Viewport } from 'next'
import '@/styles/globals.css'

const url = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: { default: 'DialDesk: AI phone receptionist for plumbers and HVAC companies', template: '%s | DialDesk' },
  description: 'Answers every call while you are on the job, flags emergencies to your on-call tech, and books repairs into arrival windows.',
  openGraph: { type: 'website', title: 'DialDesk', description: 'Every call answered, every emergency flagged, every job booked.', url },
  robots: { index: true, follow: true },
}
export const viewport: Viewport = { themeColor: '#0b1c2b', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-50 text-brand-950 antialiased">{children}</body>
    </html>
  )
}
