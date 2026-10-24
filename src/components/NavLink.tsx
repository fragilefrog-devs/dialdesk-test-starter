'use client'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, CalendarCheck, CreditCard, Globe, Hash, LayoutDashboard, MessageSquare, Mic, Phone, Settings, ShieldCheck, Users, type LucideIcon } from 'lucide-react'

export const NAV_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard, calls: Phone, messages: MessageSquare, jobs: CalendarCheck, receptionist: Mic,
  knowledge: BookOpen, numbers: Hash, install: Globe, guide: BookOpen, team: Users, settings: Settings, billing: CreditCard, admin: ShieldCheck,
}

export function NavLink({ href, icon, children, onNavigate, collapsed = false }: { href: string; icon: string; children: React.ReactNode; onNavigate?: () => void; collapsed?: boolean }) {
  const path = usePathname()
  const active = href === '/dashboard' ? path === href : path.startsWith(href)
  const Icon = NAV_ICONS[icon]
  const ref = useRef<HTMLAnchorElement>(null)
  const label = typeof children === 'string' ? children : undefined
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [active])
  return (
    <Link
      ref={ref}
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      className={`relative flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition md:w-full ${collapsed ? 'md:justify-center md:px-0' : ''} ${active ? 'bg-surface-2 text-primary' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}
    >
      {active && <span aria-hidden className="absolute inset-y-2 left-0 hidden w-0.5 rounded-full bg-primary md:block" />}
      {Icon && <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : ''}`} aria-hidden />}
      <span className={collapsed ? 'md:sr-only' : ''}>{children}</span>
    </Link>
  )
}
