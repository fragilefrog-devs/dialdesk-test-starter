'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Menu, X } from 'lucide-react'
import { signOut } from '@/app/(auth)/actions'
import { CommandPalette } from '@/components/CommandPalette'
import { NavLink } from '@/components/NavLink'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BrandMark } from '@/components/marketing'
import { NAV_GROUPS, allNav } from '@/lib/nav'

export function DashboardChrome({
  children,
  orgName,
  userEmail,
  isPlatformAdmin,
}: {
  children: ReactNode
  orgName: string
  userEmail: string
  isPlatformAdmin: boolean
}) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const initials = userEmail.split('@')[0].split(/[._-]/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
  const activePage = allNav()
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]
  const pageTitle = pathname === '/admin' ? 'Platform admin' : activePage?.label ?? 'Overview'

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    const updateForViewport = () => {
      update()
      if (!media.matches) setMenuOpen(false)
    }
    update()
    media.addEventListener('change', updateForViewport)
    return () => media.removeEventListener('change', updateForViewport)
  }, [])

  useEffect(() => {
    if (!menuOpen || !isMobile) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
      if (event.key === 'Tab') {
        const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (!focusable?.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    sidebarRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus()
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousOverflow
    }
  }, [isMobile, menuOpen])

  const closeNavigation = () => {
    setMenuOpen(false)
    if (isMobile) menuButtonRef.current?.focus()
  }

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-primary focus:px-4 focus:text-sm focus:font-medium focus:text-primary-fg">
        Skip to content
      </a>

      {menuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={closeNavigation}
          className="fixed inset-0 z-30 bg-band/60 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        ref={sidebarRef}
        id="dashboard-navigation"
        role={isMobile ? 'dialog' : undefined}
        aria-label="Dashboard navigation"
        aria-hidden={isMobile && !menuOpen}
        aria-modal={isMobile && menuOpen ? true : undefined}
        inert={isMobile && !menuOpen}
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(290px,84vw)] -translate-x-full flex-col overflow-y-auto border-r border-line bg-surface px-3 py-5 transition-transform duration-200 ease-out motion-reduce:transition-none md:w-[238px] md:translate-x-0 ${menuOpen ? 'translate-x-0' : ''}`}
      >
        <div className="px-2">
          <div className="flex items-center justify-between pb-5">
            <Link href="/dashboard" onClick={closeNavigation} className="flex items-center gap-2.5 px-2 font-display text-xl font-extrabold tracking-tight text-ink">
              <BrandMark />
              DialDesk
            </Link>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={closeNavigation}
              className="grid h-11 w-11 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink md:hidden"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-canvas p-2.5">
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-bold text-primary">
              {orgName.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">{orgName}</span>
              <span className="mt-0.5 block text-xs text-muted">Business workspace</span>
            </span>
          </div>
        </div>

        <nav aria-label="Dashboard" className="space-y-5 px-1">
          {NAV_GROUPS.map(({ group, items }) => (
            <div key={group}>
              <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-faint">{group}</p>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink key={item.href} href={item.href} icon={item.icon} onNavigate={closeNavigation}>{item.label}</NavLink>
                ))}
              </div>
            </div>
          ))}
          {isPlatformAdmin && <NavLink href="/admin" icon="admin" onNavigate={closeNavigation}>Platform admin</NavLink>}
        </nav>

        <div className="mt-4 border-t border-line pt-3">
          <Link href="/dashboard/install" onClick={closeNavigation} className="mb-3 block rounded-xl border border-line bg-surface-2 p-3 transition hover:border-primary/30">
            <span className="text-sm font-semibold text-ink">Need a hand?</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">Use the setup guide to get your receptionist ready.</span>
            <span className="mt-2 block text-sm font-semibold text-primary">Open setup guide</span>
          </Link>
          <div className="flex items-center gap-2.5 border-t border-line px-1 pt-3">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold text-primary">{initials || '?'}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{userEmail}</span>
              <span className="mt-0.5 block text-xs text-muted">{isPlatformAdmin ? 'Platform admin' : 'Workspace member'}</span>
            </span>
            <form action={signOut}>
              <button type="submit" aria-label="Sign out" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink">
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0 md:ml-[238px]">
        <header className="header-glass sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-line px-4 md:px-[30px]">
          <button
            ref={menuButtonRef}
            type="button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-controls="dashboard-navigation"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            onClick={() => setMenuOpen((open) => !open)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted transition hover:bg-surface-2 hover:text-ink md:hidden"
          >
            {menuOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          </button>
          <p className="min-w-0 truncate text-sm text-muted">
            <span className="hidden sm:inline">Workspace <span className="mx-2 text-faint">/</span></span>
            <span className="font-semibold text-ink">{pageTitle}</span>
          </p>
          <div className="ml-auto w-11 shrink-0 md:w-48 lg:w-64">
            <CommandPalette />
          </div>
          <ThemeToggle compact />
          <div className="hidden max-w-48 items-center gap-2 lg:flex">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold text-primary">{initials || '?'}</span>
            <span className="truncate text-xs font-semibold text-ink">{userEmail}</span>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="min-w-0 p-4 focus:outline-none md:px-[30px] md:py-7">
          <div className="mx-auto max-w-[1600px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
