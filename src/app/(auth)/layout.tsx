import Link from 'next/link'
import { BrandMark, Wordmark } from '@/components/marketing'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page min-h-[100dvh] bg-canvas lg:grid lg:grid-cols-[minmax(360px,0.85fr)_1.15fr]">
      <section className="auth-story relative hidden min-h-[100dvh] flex-col justify-between overflow-hidden bg-band p-10 text-band-fg lg:flex xl:p-16">
        <Link href="/" aria-label="DialDesk home" className="w-fit"><Wordmark light /></Link>
        <div className="relative max-w-xl">
          <BrandMark className="mb-7 h-12 w-12" />
          <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-band-fg xl:text-5xl">
            Every call answered. Every opportunity captured.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-band-fg/75">
            Meet your AI receptionist, ready to welcome callers, book appointments, and keep your team focused on the work.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm font-medium text-band-fg/80">
            <span className="rounded-lg border border-band-fg/15 bg-band-fg/5 px-3 py-2">Calls answered</span>
            <span className="rounded-lg border border-band-fg/15 bg-band-fg/5 px-3 py-2">Appointments booked</span>
            <span className="rounded-lg border border-band-fg/15 bg-band-fg/5 px-3 py-2">Leads captured</span>
          </div>
        </div>
        <p className="text-sm text-band-fg/65">© {new Date().getFullYear()} DialDesk. AI-powered business communications.</p>
      </section>

      <section className="auth-form flex min-h-[100dvh] items-start justify-center px-4 py-8 sm:px-8 sm:py-10 lg:items-center lg:px-12">
        <div className="page-enter w-full max-w-[440px]">
          <Link href="/" aria-label="DialDesk home" className="mb-7 flex w-fit lg:hidden"><Wordmark /></Link>
          <div className="rounded-[15px] border border-line bg-surface p-6 shadow-card sm:p-9">{children}</div>
        </div>
      </section>
    </main>
  )
}
