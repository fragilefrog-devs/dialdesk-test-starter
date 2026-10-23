import Link from 'next/link'
import { PLANS } from '@/lib/plans'
import { btn } from './ui'

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className={`flex items-center gap-2 font-display text-2xl font-semibold ${light ? 'text-[#e8eef2]' : 'text-ink'}`}>
      <span aria-hidden className="h-5 w-5 rounded-sm bg-signal" />DialDesk
    </span>
  )
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" aria-label="DialDesk home"><Wordmark /></Link>
        <nav className="flex items-center gap-2 text-sm font-medium text-muted sm:gap-4">
          <Link href="/#how" className="hidden min-h-11 items-center px-2 transition hover:text-ink sm:flex">How it works</Link>
          <Link href="/pricing" className="flex min-h-11 items-center px-2 transition hover:text-ink">Pricing</Link>
          <Link href="/login" className="flex min-h-11 items-center px-2 transition hover:text-ink">Log in</Link>
          <Link href="/signup" className={`${btn.primary} hidden sm:inline-flex`}>Start free trial</Link>
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted md:px-6">
        <p>© {new Date().getFullYear()} DialDesk. Calls are answered by an AI assistant and may be recorded.</p>
        <nav className="flex gap-2"><Link href="/terms" className="flex min-h-11 items-center px-2 hover:text-ink">Terms</Link><Link href="/privacy" className="flex min-h-11 items-center px-2 hover:text-ink">Privacy</Link></nav>
      </div>
    </footer>
  )
}

export function PricingGrid() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {Object.values(PLANS).map((p) => (
        <div key={p.id} className={`reveal flex flex-col rounded-xl border bg-surface p-8 shadow-card ${p.highlight ? 'border-primary' : 'border-line'}`}>
          <h3 className="font-display text-2xl text-ink">{p.name}</h3>
          <p className="mt-4"><span className="font-display text-5xl font-semibold leading-[1.1] tabular-nums text-ink">${p.priceUsd}</span><span className="text-sm text-muted"> a month</span></p>
          <p className="mt-2 text-sm text-faint">${p.overageUsdPerMin.toFixed(2)} for each extra minute</p>
          <ul className="my-6 flex-1 space-y-3 text-sm text-ink">
            {p.features.map((f) => <li key={f} className="flex gap-3"><span aria-hidden className="text-good">✓</span>{f}</li>)}
          </ul>
          <Link href={`/signup?plan=${p.id}`} className={p.highlight ? btn.primary : btn.secondary}>Start 14-day trial</Link>
        </div>
      ))}
    </div>
  )
}
