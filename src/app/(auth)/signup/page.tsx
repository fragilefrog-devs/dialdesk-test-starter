import Link from 'next/link'
import type { Metadata } from 'next'
import { signUp } from '../actions'
import { btn, input, label, Notice } from '@/components/ui'
export const metadata: Metadata = { title: 'Start free trial' }

export default async function Signup({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <>
      <h1 className="mb-1 text-xl font-bold text-brand-950">Start your 14-day free trial</h1>
      <p className="mb-4 text-sm text-brand-800/70">No credit card required.</p>
      {error && <Notice kind="error">{error}</Notice>}
      <form action={signUp} className="space-y-4">
        <div><label htmlFor="name" className={label}>Your name</label><input id="name" name="name" required autoComplete="name" className={input} /></div>
        <div><label htmlFor="email" className={label}>Work email</label><input id="email" name="email" type="email" required autoComplete="email" className={input} /></div>
        <div><label htmlFor="password" className={label}>Password</label><input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={input} /></div>
        <button className={`${btn.primary} w-full`}>Create account</button>
      </form>
      <p className="mt-3 text-center text-xs text-brand-800/60">By signing up you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.</p>
      <p className="mt-3 text-center text-sm text-brand-800/70">Have an account? <Link href="/login" className="font-semibold text-brand-600">Log in</Link></p>
    </>
  )
}
