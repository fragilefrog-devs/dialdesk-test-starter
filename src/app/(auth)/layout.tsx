import Link from 'next/link'
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-brand-50 to-white px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 font-bold text-brand-900"><span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">☎</span> Receptionist AI</Link>
        <div className="rounded-2xl border border-brand-200/70 bg-white p-6 shadow-elevated">{children}</div>
      </div>
    </main>
  )
}
