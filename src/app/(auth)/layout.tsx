import Link from 'next/link'
import { Wordmark } from '@/components/marketing'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <div className="page-enter w-full max-w-sm">
        <Link href="/" aria-label="DialDesk home" className="mb-8 flex justify-center"><Wordmark /></Link>
        <div className="rounded-xl border border-line bg-surface p-8 shadow-elevated">{children}</div>
      </div>
    </main>
  )
}
