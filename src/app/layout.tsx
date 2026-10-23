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
export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f4f6f5' }, { media: '(prefers-color-scheme: dark)', color: '#0b141b' }],
  width: 'device-width', initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink antialiased">{children}</body>
    </html>
  )
}
