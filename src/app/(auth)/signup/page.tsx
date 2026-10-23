import { SubmitButton } from '@/components/SubmitButton'
import Link from 'next/link'
import type { Metadata } from 'next'
import { signUp } from '../actions'
import { btn, input, label, Notice } from '@/components/ui'
export const metadata: Metadata = { title: 'Start free trial' }

export default async function Signup({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">Create your workspace</h1>
      <p className="mb-6 mt-2 text-sm text-muted">Start with your business profile. No credit card required.</p>
      {error && <Notice kind="error">{error}</Notice>}
      <form action={signUp} className="space-y-4">
        <div><label htmlFor="name" className={label}>Your name</label><input id="name" name="name" required autoComplete="name" className={input} /></div>
        <div><label htmlFor="email" className={label}>Work email</label><input id="email" name="email" type="email" required autoComplete="email" className={input} /></div>
        <div><label htmlFor="password" className={label}>Password</label><input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={input} /></div>
        <SubmitButton className={`${btn.primary} w-full`}>Create account</SubmitButton>
      </form>
      <p className="mt-4 text-center text-xs leading-relaxed text-muted">By continuing, you agree to our <Link href="/terms" className="font-medium text-primary underline underline-offset-2">Terms</Link> and <Link href="/privacy" className="font-medium text-primary underline underline-offset-2">Privacy Policy</Link>.</p>
      <p className="mt-4 text-center text-sm text-muted">Already have an account? <Link href="/login" className="font-semibold text-primary hover:underline">Sign in</Link></p>
    </>
  )
}
