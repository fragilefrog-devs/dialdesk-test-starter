'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname()
  const active = href === '/dashboard' ? path === href : path.startsWith(href)
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${active ? 'bg-brand-600 text-white' : 'text-brand-900 hover:bg-brand-100'}`}>
      {children}
    </Link>
  )
}
