import { SubmitButton } from '@/components/SubmitButton'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { btn } from '@/components/ui'

export const dynamic = 'force-dynamic'

async function accept(fd: FormData) {
  'use server'
  const token = String(fd.get('token'))
  const { data: { user } } = await (await supabaseServer()).auth.getUser()
  if (!user) redirect(`/login?next=/invite/${token}`)
  const db = supabaseAdmin()
  const { data: inv } = await db.from('invites').select('*').eq('token', token).is('accepted_at', null).gt('expires_at', new Date().toISOString()).maybeSingle()
  if (!inv || inv.email.toLowerCase() !== (user.email ?? '').toLowerCase()) redirect('/invite/' + token + '?error=1')
  await db.from('memberships').upsert({ org_id: inv.org_id, user_id: user.id, role: inv.role }, { onConflict: 'org_id,user_id' })
  await db.from('invites').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id)
  redirect('/dashboard')
}

export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params
  const { error } = await searchParams
  const { data: { user } } = await (await supabaseServer()).auth.getUser()
  if (!user) redirect(`/login?next=/invite/${token}`)
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <form action={accept} className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 text-center shadow-card">
        <h1 className="text-xl font-semibold text-ink">Join your team</h1>
        <p className="mb-4 mt-1 text-sm text-muted">Signed in as {user.email}</p>
        {error && <p role="alert" className="mb-3 text-sm text-danger">This invite is invalid, expired, or for a different email address.</p>}
        <input type="hidden" name="token" value={token} />
        <SubmitButton className={`${btn.primary} w-full`}>Accept invitation</SubmitButton>
      </form>
    </main>
  )
}
