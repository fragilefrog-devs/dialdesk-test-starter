import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { requireAdmin } from '@/lib/auth'
import { signOut } from '@/app/(auth)/actions'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BrandMark } from '@/components/marketing'

export const dynamic = 'force-dynamic'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-primary focus:px-4 focus:text-sm focus:font-medium focus:text-primary-fg">
        Skip to content
      </a>
      <header className="header-glass sticky top-0 z-20 border-b border-line">
        <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between gap-4 px-4 md:px-[30px]">
          <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight text-ink">
            <BrandMark />
            DialDesk <span className="text-muted">Admin</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action={signOut}>
              <button className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink">
                <LogOut className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-[1600px] p-4 focus:outline-none md:px-[30px] md:py-7">
        {children}
      </main>
    </div>
  )
}
