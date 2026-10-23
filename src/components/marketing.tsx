import Link from 'next/link'
import Image from 'next/image'
import { PLANS } from '@/lib/plans'
import { ThemeToggle } from './ThemeToggle'
import { btn } from './ui'

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <Image src="/dialdesk-mark.svg" alt="" aria-hidden width={34} height={34} className={`h-[34px] w-[34px] shrink-0 rounded-xl shadow-soft ${className}`} />
  )
}

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className={`flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight ${light ? 'text-band-fg' : 'text-ink'}`}>
      <BrandMark />
      DialDesk
    </span>
  )
}

export function SiteHeader() {
  return (
    <header className="header-glass sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between gap-4 px-4 md:px-[30px]">
        <Link href="/" aria-label="DialDesk home"><Wordmark /></Link>
        <nav aria-label="Main navigation" className="flex shrink-0 items-center gap-1 text-sm font-semibold text-muted sm:gap-2 lg:gap-4">
          <Link href="/#features" className="hidden min-h-11 items-center px-2 transition hover:text-ink md:flex">Features</Link>
          <Link href="/#how" className="hidden min-h-11 items-center px-2 transition hover:text-ink lg:flex">How it works</Link>
          <Link href="/pricing" className="hidden min-h-11 items-center px-2 transition hover:text-ink sm:flex">Pricing</Link>
          <Link href="/login" className="flex min-h-11 items-center px-2 transition hover:text-ink">Sign in</Link>
          <ThemeToggle compact />
          <Link href="/signup" className={`${btn.primary} whitespace-nowrap`}>Get started</Link>
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted md:px-[30px]">
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
        <div key={p.id} className={`reveal relative flex flex-col rounded-xl border bg-surface p-8 shadow-card transition-shadow hover:shadow-elevated ${p.highlight ? 'border-primary' : 'border-line'}`}>
          {p.highlight && <span className="absolute -top-3 left-8 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-fg">Most popular</span>}
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
