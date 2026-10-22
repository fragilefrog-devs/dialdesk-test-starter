import type { Metadata, Viewport } from 'next'
import '@/styles/globals.css'

const url = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: { default: 'AI Voice Receptionist — never miss a call again', template: '%s · AI Voice Receptionist' },
  description: 'An AI receptionist that answers every call, books appointments and captures leads 24/7. Live in 10 minutes — no hardware, no contracts.',
  openGraph: { type: 'website', title: 'AI Voice Receptionist', description: 'Answer every call, book appointments, capture leads — 24/7.', url },
  robots: { index: true, follow: true },
}
export const viewport: Viewport = { themeColor: '#0d7377', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-50 text-brand-950 antialiased">{children}</body>
    </html>
  )
}
