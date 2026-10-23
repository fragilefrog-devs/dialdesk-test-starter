import { SubmitButton } from '@/components/SubmitButton'
import type { Metadata } from 'next'
import { requireOrg } from '@/lib/auth'
import { purchaseNumber, removeNumber } from '../actions'
import { limitsFor } from '@/lib/plans'
import { btn, Card, Empty, input, label, Notice, PageHeader } from '@/components/ui'
export const metadata: Metadata = { title: 'Phone numbers' }

export default async function Numbers({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams
  const { supabase, org, role } = await requireOrg()
  const { data: owned } = await supabase.from('phone_numbers').select('id, e164, status').eq('org_id', org.id)
  const limit = limitsFor(org.plan).numbers
  return (
    <>
      <PageHeader title="Phone numbers" sub={`${owned?.length ?? 0} of ${limit} used on your plan.`} />
      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="success">{ok}</Notice>}
      {!owned?.length ? <Empty title="No number yet" body="Get a local number below. Then forward your business line to it so missed and after-hours calls reach the receptionist." /> : (
        <div className="mb-6 space-y-3">{owned.map((n) => (
          <Card key={n.id} className="flex items-center justify-between"><p className="text-lg font-semibold tabular-nums text-ink">{n.e164}</p>
            {role !== 'member' && <form action={removeNumber}><input type="hidden" name="id" value={n.id} /><button className={btn.danger}>Release</button></form>}</Card>
        ))}</div>
      )}
      {role !== 'member' && (
        <Card className="mt-6">
          <h2 className="mb-1 font-semibold text-ink">Get a US number</h2>
          <p className="mb-3 text-sm text-muted">Pick the area code your customers recognise. The number is ready immediately.</p>
          <form action={purchaseNumber} className="flex flex-wrap items-end gap-3">
            <div><label htmlFor="area" className={label}>Area code</label><input id="area" name="area" required inputMode="numeric" pattern="[2-9][0-9]{2}" maxLength={3} className={`${input} !w-28`} placeholder="312" /></div>
            <SubmitButton className={btn.primary}>Get number</SubmitButton>
          </form>
        </Card>
      )}
      <Card className="mt-6">
        <h2 className="mb-2 font-semibold text-ink">Keep your existing number</h2>
        <p className="text-sm text-ink">Set call forwarding on your current line to the number above. Most carriers let you forward when busy, when unanswered, or after hours. Start with unanswered and after-hours calls so your team still picks up first.</p>
      </Card>
    </>
  )
}
