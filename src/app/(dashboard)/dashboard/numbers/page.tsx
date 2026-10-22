import type { Metadata } from 'next'
import { requireOrg } from '@/lib/auth'
import { purchaseNumber, removeNumber } from '../actions'
import { searchNumbers } from '@/lib/twilio'
import { limitsFor } from '@/lib/plans'
import { btn, Card, Empty, input, label, Notice, PageHeader } from '@/components/ui'
export const metadata: Metadata = { title: 'Phone numbers' }

export default async function Numbers({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; country?: string; area?: string }> }) {
  const { error, ok, country: countryParam, area } = await searchParams
  const { supabase, org, role } = await requireOrg()
  const { data: owned } = await supabase.from('phone_numbers').select('id, e164, status').eq('org_id', org.id)
  const limit = limitsFor(org.plan).numbers
  const country = /^[A-Za-z]{2}$/.test(countryParam ?? '') ? countryParam!.toUpperCase() : 'US'
  let available: { phone_number: string; friendly_name: string }[] = []
  let searchError = ''
  if (countryParam || area) {
    try { available = await searchNumbers(country, /^\d{2,4}$/.test(area ?? '') ? area : undefined) }
    catch { searchError = 'No numbers available for that search (some countries need regulatory approval first).' }
  }
  return (
    <>
      <PageHeader title="Phone numbers" sub={`${owned?.length ?? 0} of ${limit} used on your plan.`} />
      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="success">{ok}</Notice>}
      {!owned?.length ? <Empty title="No number yet" body="Get a local number below, or forward your existing line to it." /> : (
        <div className="mb-6 space-y-3">{owned.map((n) => (
          <Card key={n.id} className="flex items-center justify-between"><p className="text-lg font-semibold tabular-nums text-brand-950">{n.e164}</p>
            {role !== 'member' && <form action={removeNumber}><input type="hidden" name="id" value={n.id} /><button className={btn.danger}>Release</button></form>}</Card>
        ))}</div>
      )}
      {role !== 'member' && (
        <Card className="mt-6">
          <h2 className="mb-3 font-semibold text-brand-950">Get a number</h2>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div><label htmlFor="country" className={label}>Country (ISO)</label><input id="country" name="country" defaultValue={country} maxLength={2} className={`${input} !w-24 uppercase`} /></div>
            <div><label htmlFor="area" className={label}>Area code (optional)</label><input id="area" name="area" defaultValue={area} inputMode="numeric" className={`${input} !w-36`} /></div>
            <button className={btn.secondary}>Search</button>
          </form>
          {searchError && <p className="mt-3 text-sm text-red-700">{searchError}</p>}
          {available.length > 0 && (
            <ul className="mt-4 divide-y divide-brand-100">{available.map((n) => (
              <li key={n.phone_number} className="flex items-center justify-between py-2.5"><span className="tabular-nums">{n.friendly_name}</span>
                <form action={purchaseNumber}><input type="hidden" name="e164" value={n.phone_number} /><button className={btn.primary}>Use this number</button></form></li>
            ))}</ul>
          )}
        </Card>
      )}
    </>
  )
}
