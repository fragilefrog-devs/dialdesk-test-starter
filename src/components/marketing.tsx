import Link from 'next/link'
import { PLANS } from '@/lib/plans'
import { btn } from './ui'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-brand-200/60 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2 font-bold text-brand-900">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">☎</span> Receptionist AI
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium text-brand-800">
          <Link href="/#how" className="hidden sm:block hover:text-brand-600">How it works</Link>
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
    <footer className="border-t border-brand-200/60 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-brand-800/70">
        <p>© {new Date().getFullYear()} Receptionist AI. Calls are handled by an AI assistant and may be recorded and transcribed.</p>
        <nav className="flex gap-5"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></nav>
      </div>
    </footer>
  )
}

export function PricingGrid() {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {Object.values(PLANS).map((p) => (
        <div key={p.id} className={`flex flex-col rounded-2xl border bg-white p-6 shadow-card ${p.highlight ? 'border-brand-500 ring-2 ring-brand-400/30' : 'border-brand-200/70'}`}>
          {p.highlight && <span className="mb-3 w-fit rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">Most popular</span>}
          <h3 className="text-lg font-bold text-brand-950">{p.name}</h3>
          <p className="mt-2"><span className="text-4xl font-extrabold text-brand-950">${p.priceUsd}</span><span className="text-sm text-brand-800/70"> / month</span></p>
          <p className="mt-1 text-xs text-brand-800/60">then ${p.overageUsdPerMin.toFixed(2)} per extra minute</p>
          <ul className="my-5 flex-1 space-y-2 text-sm text-brand-900">
            {p.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden className="text-accent-600">✓</span>{f}</li>)}
          </ul>
          <Link href={`/signup?plan=${p.id}`} className={p.highlight ? btn.primary : btn.secondary}>Start 14-day trial</Link>
        </div>
      ))}
    </div>
  )
}
