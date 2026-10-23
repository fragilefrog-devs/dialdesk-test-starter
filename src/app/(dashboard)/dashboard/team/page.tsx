import { SubmitButton } from '@/components/SubmitButton'
import type { Metadata } from 'next'
import { requireOrg } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { inviteMember, removeMember } from '../actions'
import { Badge, btn, Card, input, label, Notice, PageHeader } from '@/components/ui'
export const metadata: Metadata = { title: 'Team' }

export default async function Team({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams
  const { supabase, org, role, user } = await requireOrg()
  const { data: members } = await supabase.from('memberships').select('user_id, role').eq('org_id', org.id)
  // profiles are self-only under RLS; membership was verified above, so reading emails with the service role is safe here
  const { data: profiles } = await supabaseAdmin().from('profiles').select('id, email, full_name').in('id', (members ?? []).map((m) => m.user_id))
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))
  const { data: invites } = role !== 'member'
    ? await supabase.from('invites').select('id, email, role, expires_at').eq('org_id', org.id).is('accepted_at', null).gt('expires_at', new Date().toISOString())
    : { data: [] }
  return (
    <>
      <PageHeader title="Team" sub="People who can see this workspace." />
      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="success">{ok}</Notice>}
      <Card className="divide-y divide-line !p-0">
        {(members ?? []).map((m) => (
          <div key={m.user_id} className="flex items-center justify-between p-4">
            <div><p className="font-medium text-ink">{byId.get(m.user_id)?.full_name || byId.get(m.user_id)?.email}</p><p className="text-xs text-faint">{byId.get(m.user_id)?.email}</p></div>
            <div className="flex items-center gap-3"><Badge>{m.role}</Badge>
              {role !== 'member' && m.role !== 'owner' && m.user_id !== user.id && <form action={removeMember}><input type="hidden" name="user_id" value={m.user_id} /><button className={btn.danger}>Remove</button></form>}</div>
          </div>
        ))}
      </Card>
      {role !== 'member' && (
        <>
          <Card className="mt-6">
            <h2 className="mb-3 font-semibold text-ink">Invite a teammate</h2>
            <form action={inviteMember} className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1"><label htmlFor="email" className={label}>Email</label><input id="email" name="email" type="email" required className={input} /></div>
              <div><label htmlFor="role" className={label}>Role</label><select id="role" name="role" className={input}><option value="member">Member</option><option value="admin">Admin</option></select></div>
              <SubmitButton className={btn.primary}>Send invite</SubmitButton>
            </form>
          </Card>
          {!!invites?.length && <p className="mt-4 text-sm text-muted">Pending: {invites.map((i) => i.email).join(', ')}</p>}
        </>
      )}
    </>
  )
}
