import Link from 'next/link'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CountUp } from '@/components/CountUp'

/** Shared building blocks. All colors are semantic tokens from globals.css. Controls are 44px tall for touch. */
export const btn = {
  primary: 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg shadow-soft transition hover:bg-primary-hover active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60',
  secondary: 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-control bg-surface px-4 text-sm font-medium text-ink transition hover:bg-surface-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60',
  signal: 'inline-flex min-h-12 items-center justify-center rounded-lg bg-signal px-6 text-base font-medium text-signal-fg shadow-soft transition hover:bg-signal-hover active:translate-y-px',
  danger: 'inline-flex min-h-11 items-center justify-center rounded-lg border border-danger/40 px-4 text-sm font-medium text-danger transition hover:bg-danger-soft active:translate-y-px disabled:opacity-60',
}
export const input = 'min-h-11 w-full rounded-lg border border-control bg-surface px-3 py-2 text-base text-ink placeholder:text-faint transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm'
export const label = 'mb-2 block text-sm font-medium text-ink'

/** L1 surface: hairline border first, then a faint shadow. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface p-6 shadow-card ${className}`}>{children}</section>
}

/** A framed list: one panel, hairline row dividers. Prefer this over a stack of cards. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card ${className}`}>{children}</div>
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[27px] font-extrabold tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-1 max-w-prose text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function Stat({ label, value, hint, progress, icon: Icon }: { label: string; value: string | number; hint?: string; progress?: number; icon?: LucideIcon }) {
  const ratio = progress !== undefined && Number.isFinite(progress) ? Math.max(0, progress) : undefined
  return (
    <Card className="!p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted">{label}</p>
        {Icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-primary"><Icon className="h-4 w-4" aria-hidden /></span>}
      </div>
      <p className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight tabular-nums text-ink"><CountUp value={value} /></p>
      {ratio !== undefined && (
        <div role="progressbar" aria-label={`${label}, share of plan used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(ratio, 1) * 100)} className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className={`bar-grow h-full origin-left rounded-full ${ratio > 1 ? 'bg-warn' : 'bg-primary'}`} style={{ transform: `scaleX(${Math.min(ratio, 1)})` }} />
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  )
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad'
const TONE: Record<Tone, [string, string]> = {
  neutral: ['bg-faint', 'text-muted'], good: ['bg-good', 'text-good'], warn: ['bg-warn', 'text-warn'], bad: ['bg-danger', 'text-danger'],
}
/** Status is a dot plus a word, never color alone and never a decorative pill. */
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  const [dot, text] = TONE[tone]
  return <span className={`inline-flex items-center gap-2 text-sm font-medium ${text}`}><span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />{children}</span>
}

const OUTCOMES: Record<string, [string, Tone]> = {
  booked: ['Job booked', 'good'], emergency_escalated: ['Emergency', 'bad'], lead_captured: ['Message taken', 'warn'],
  info_only: ['Info only', 'neutral'], spam: ['Spam', 'neutral'], abandoned: ['Hung up', 'neutral'],
}
export function OutcomeBadge({ outcome }: { outcome: string | null }) {
  const [text, tone] = (outcome && OUTCOMES[outcome]) || ['In progress', 'neutral']
  return <Badge tone={tone}>{text}</Badge>
}
export function UrgencyBadge({ urgency }: { urgency: string | null }) {
  if (!urgency || urgency === 'routine') return null
  return <Badge tone={urgency === 'emergency' ? 'bad' : 'warn'}>{urgency === 'emergency' ? 'Emergency' : 'Same day'}</Badge>
}

/** Zero state: what belongs here, why it matters, one action. */
export function Empty({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-8 shadow-card">
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      <p className="mt-2 max-w-prose text-sm text-muted">{body}</p>
      {href && cta && <Link href={href} className={`${btn.primary} mt-6`}>{cta}</Link>}
    </section>
  )
}

export function Notice({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  const c = kind === 'error' ? 'border-danger/30 bg-danger-soft text-danger' : 'border-good/30 bg-good-soft text-good'
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`page-enter mb-6 rounded-lg border px-4 py-3 text-sm font-medium ${c}`}>{children}</div>
}

/** Skeleton block that mirrors the final layout while a page streams in. */
export const Skeleton = ({ className = '' }: { className?: string }) => <div aria-hidden className={`skeleton ${className}`} />

export const fmtDate = (iso: string, tz = 'UTC') =>
  new Intl.DateTimeFormat('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
export const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
