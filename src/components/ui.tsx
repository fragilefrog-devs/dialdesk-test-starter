import Link from 'next/link'
import type { ReactNode } from 'react'

export const btn = {
  primary: 'inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50',
  secondary: 'inline-flex items-center justify-center rounded-lg border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-800 transition hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
  danger: 'inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50',
}
export const input = 'w-full rounded-lg border border-brand-200 bg-white px-3 py-2.5 text-sm text-brand-950 placeholder:text-brand-400/80 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/30'
export const label = 'mb-1.5 block text-sm font-medium text-brand-900'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-brand-200/70 bg-white p-5 shadow-card ${className}`}>{children}</section>
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-brand-950">{title}</h1>
        {sub && <p className="mt-1 text-sm text-brand-800/70">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-brand-800/60">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-brand-950">{value}</p>
      {hint && <p className="mt-1 text-xs text-brand-800/60">{hint}</p>}
    </Card>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const t = { neutral: 'bg-brand-100 text-brand-800', good: 'bg-accent-100 text-accent-700', warn: 'bg-amber-100 text-amber-800', bad: 'bg-red-100 text-red-700' }[tone]
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${t}`}>{children}</span>
}

export function Empty({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50/60 px-6 py-12 text-center">
      <p className="font-semibold text-brand-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-brand-800/70">{body}</p>
      {href && cta && <Link href={href} className={`${btn.primary} mt-5`}>{cta}</Link>}
    </div>
  )
}

export function Notice({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  const c = kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-accent-200 bg-accent-50 text-accent-700'
  return <div role="status" className={`mb-4 rounded-lg border px-3 py-2 text-sm ${c}`}>{children}</div>
}

export const fmtDate = (iso: string, tz = 'UTC') =>
  new Intl.DateTimeFormat('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
export const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
