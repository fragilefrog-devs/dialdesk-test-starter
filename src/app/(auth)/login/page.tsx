import { SubmitButton } from '@/components/SubmitButton'
import Link from 'next/link'
import type { Metadata } from 'next'
import { signIn } from '../actions'
import { btn, input, label, Notice } from '@/components/ui'
export const metadata: Metadata = { title: 'Log in' }

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; next?: string }> }) {
  const { error, notice, next } = await searchParams
  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">Welcome back</h1>
      <p className="mb-6 mt-2 text-sm text-muted">Sign in to manage your receptionist and review calls.</p>
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="success">{notice}</Notice>}
      <form action={signIn} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ''} />
        <div><label htmlFor="email" className={label}>Work email</label><input id="email" name="email" type="email" required autoComplete="email" className={input} /></div>
        <div><label htmlFor="password" className={label}>Password</label><input id="password" name="password" type="password" required autoComplete="current-password" className={input} /></div>
        <SubmitButton className={`${btn.primary} w-full`}>Sign in</SubmitButton>
      </form>
      <p className="mt-5 text-center text-sm text-muted">New to DialDesk? <Link href="/signup" className="font-semibold text-primary hover:underline">Create an account</Link></p>
    </>
  )
}
