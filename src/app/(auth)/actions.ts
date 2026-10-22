'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase/server'
import { isTransportError, unreachableAuthMessage } from '@/lib/supabase/errors'
import { safeNext } from '@/lib/safe-redirect'

const creds = z.object({ email: z.string().email().max(200), password: z.string().min(8, 'Password must be at least 8 characters').max(200) })
const back = (page: string, msg: string): never => redirect(`${page}?error=${encodeURIComponent(msg)}`)

export async function signIn(fd: FormData) {
  const p = creds.safeParse({ email: fd.get('email'), password: fd.get('password') })
  if (!p.success) back('/login', p.error.issues[0].message)
  const { error } = await (await supabaseServer()).auth.signInWithPassword(p.data!)
  if (error) back('/login', isTransportError(error) ? unreachableAuthMessage() : 'Invalid email or password')
  redirect(safeNext(String(fd.get('next') ?? '')))
}

export async function signUp(fd: FormData) {
  const p = creds.safeParse({ email: fd.get('email'), password: fd.get('password') })
  if (!p.success) back('/signup', p.error.issues[0].message)
  const origin = process.env.NEXT_PUBLIC_APP_URL
  const { data, error } = await (await supabaseServer()).auth.signUp({
    ...p.data!, options: { data: { full_name: String(fd.get('name') ?? '').slice(0, 100) }, emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  })
  if (error) {
    if (isTransportError(error)) {
      const cause = typeof error.cause === 'object' && error.cause !== null
        ? error.cause as { name?: unknown; code?: unknown }
        : {}
      console.error('[auth] Supabase Auth sign-up request failed', {
        name: error.name,
        causeName: cause.name,
        causeCode: cause.code,
      })
      back('/signup', unreachableAuthMessage())
    }
    back('/signup', error.message)
  }
  if (!data.session) redirect('/login?notice=' + encodeURIComponent('Check your email to confirm your account, then log in.'))
  redirect('/onboarding')
}

export async function signOut() {
  await (await supabaseServer()).auth.signOut()
  redirect('/')
}
