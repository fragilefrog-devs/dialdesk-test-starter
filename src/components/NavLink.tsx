'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, CalendarCheck, CreditCard, Hash, LayoutDashboard, MessageSquare, Mic, Phone, Users, type LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard, calls: Phone, messages: MessageSquare, jobs: CalendarCheck, receptionist: Mic,
  knowledge: BookOpen, numbers: Hash, team: Users, billing: CreditCard,
}

export function NavLink({ href, icon, children }: { href: string; icon: string; children: React.ReactNode }) {
  const path = usePathname()
  const active = href === '/dashboard' ? path === href : path.startsWith(href)
  const Icon = ICONS[icon]
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${active ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}>
      {active && <span aria-hidden className="absolute inset-y-2 left-0 hidden w-0.5 rounded-full bg-primary md:block" />}
      {Icon && <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : ''}`} aria-hidden />}
      {children}
    </Link>
  )
}
