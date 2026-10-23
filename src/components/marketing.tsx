import Link from 'next/link'
import { PLANS } from '@/lib/plans'
import { btn } from './ui'

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className={`flex items-center gap-2 font-display text-2xl font-bold ${light ? 'text-white' : 'text-brand-950'}`}>
      <span aria-hidden className="h-5 w-5 rounded-sm bg-signal-400" />DialDesk
    </span>
  )
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-brand-200/70 bg-surface-50/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" aria-label="DialDesk home"><Wordmark /></Link>
        <nav className="flex items-center gap-5 text-sm font-medium text-brand-800">
          <Link href="/#how" className="hidden hover:text-brand-600 sm:block">How it works</Link>
          <Link href="/pricing" className="hover:text-brand-600">Pricing</Link>
          <Link href="/login" className="hover:text-brand-600">Log in</Link>
          <Link href="/signup" className={btn.primary}>Start free trial</Link>
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-brand-200/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-brand-800/70">
        <p>© {new Date().getFullYear()} DialDesk. Calls are answered by an AI assistant and may be recorded.</p>
        <nav className="flex gap-5"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></nav>
      </div>
    </footer>
  )
}

export function PricingGrid() {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {Object.values(PLANS).map((p) => (
        <div key={p.id} className={`flex flex-col rounded-xl border bg-white p-6 shadow-card ${p.highlight ? 'border-brand-600 ring-2 ring-brand-600/20' : 'border-brand-200/70'}`}>
          <h3 className="text-2xl font-bold text-brand-950">{p.name}</h3>
          <p className="mt-2"><span className="font-display text-5xl font-bold text-brand-950">${p.priceUsd}</span><span className="text-sm text-brand-800/70"> a month</span></p>
          <p className="mt-1 text-sm text-brand-800/70">${p.overageUsdPerMin.toFixed(2)} for each extra minute</p>
          <ul className="my-5 flex-1 space-y-2 text-sm text-brand-900">
            {p.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden className="text-accent-600">✓</span>{f}</li>)}
          </ul>
          <Link href={`/signup?plan=${p.id}`} className={p.highlight ? btn.primary : btn.secondary}>Start 14-day trial</Link>
        </div>
      ))}
    </div>
  )
}
