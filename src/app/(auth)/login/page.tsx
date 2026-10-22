import Link from 'next/link'
import type { Metadata } from 'next'
import { signIn } from '../actions'
import { btn, input, label, Notice } from '@/components/ui'
export const metadata: Metadata = { title: 'Log in' }

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; next?: string }> }) {
  const { error, notice, next } = await searchParams
  return (
    <>
      <h1 className="mb-4 text-xl font-bold text-brand-950">Welcome back</h1>
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="success">{notice}</Notice>}
      <form action={signIn} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ''} />
        <div><label htmlFor="email" className={label}>Email</label><input id="email" name="email" type="email" required autoComplete="email" className={input} /></div>
        <div><label htmlFor="password" className={label}>Password</label><input id="password" name="password" type="password" required autoComplete="current-password" className={input} /></div>
        <button className={`${btn.primary} w-full`}>Log in</button>
      </form>
      <p className="mt-4 text-center text-sm text-brand-800/70">New here? <Link href="/signup" className="font-semibold text-brand-600">Start free trial</Link></p>
    </>
  )
}
