import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarCheck, Phone, Radio, Settings2, ShieldCheck } from 'lucide-react'
import { SubmitButton } from '@/components/SubmitButton'
import { requireOrg } from '@/lib/auth'
import { INDUSTRY_OPTIONS, getTimeZoneOptions } from '@/lib/workspace-settings'
import { saveWorkspaceSettings } from '../actions'
import { btn, Card, input, label, Notice, PageHeader } from '@/components/ui'

export const metadata: Metadata = { title: 'Workspace settings' }

const PREFERENCE_ROWS = [
  { key: 'recording', label: 'Recording notice', description: 'The assistant tells callers when calls are recorded.', icon: Radio },
  { key: 'handoff', label: 'Human handoff', description: 'Callers can request a transfer to your team.', icon: ShieldCheck },
  { key: 'notifications', label: 'Appointment notifications', description: 'Your team can receive alerts for new jobs.', icon: CalendarCheck },
] as const

export default async function WorkspaceSettings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  const { error, ok } = await searchParams
  const { supabase, org, role } = await requireOrg()
  const [agentResult, numberResult] = await Promise.all([
    supabase.from('agents').select('record_consent_notice, transfer_number, notify_phone, notify_email').eq('org_id', org.id).order('created_at').limit(1).maybeSingle(),
    supabase.from('phone_numbers').select('e164, status', { count: 'exact' }).eq('org_id', org.id).order('created_at').limit(4),
  ])
  if (agentResult.error) console.error('Workspace settings: could not load call preferences', agentResult.error)
  if (numberResult.error) console.error('Workspace settings: could not load phone numbers', numberResult.error)

  const agent = agentResult.data
  const timezoneOptions = getTimeZoneOptions()
  const readOnly = role === 'member'
  const preferences: Record<(typeof PREFERENCE_ROWS)[number]['key'], boolean> = {
    recording: !!agent?.record_consent_notice,
    handoff: !!agent?.transfer_number,
    notifications: !!(agent?.notify_phone || agent?.notify_email),
  }
  const industryLabel = INDUSTRY_OPTIONS.find(({ value }) => value === org.industry)?.label ?? 'Other'
  const otherTimezoneKnown = timezoneOptions.other.includes(org.timezone)
  const extraPhoneNumbers = Math.max(0, (numberResult.count ?? 0) - (numberResult.data?.length ?? 0))

  return (
    <>
      <PageHeader title="Workspace settings" sub="Manage your business details and review workspace defaults." />
      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="success">{ok}</Notice>}
      {agentResult.error && <Notice kind="error">Call preferences could not be loaded. <Link href="/dashboard/settings" className="font-semibold underline underline-offset-4">Try again</Link>.</Notice>}
      {numberResult.error && <Notice kind="error">Phone numbers could not be loaded. <Link href="/dashboard/settings" className="font-semibold underline underline-offset-4">Try again</Link>.</Notice>}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <form id="workspace-settings-form" action={saveWorkspaceSettings}>
          <fieldset disabled={readOnly} className="space-y-5">
            <Card className="space-y-4 !p-5">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">Business profile</h2>
                <p className="mt-1 text-sm text-muted">Details used by your receptionist and workspace.</p>
              </div>
              <div>
                <label htmlFor="workspace-name" className={label}>Business name</label>
                <input id="workspace-name" name="name" defaultValue={org.name} required minLength={2} maxLength={80} className={input} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="industry" className={label}>Industry</label>
                  <select id="industry" name="industry" defaultValue={org.industry} className={input}>
                    {INDUSTRY_OPTIONS.map(({ value, label: text }) => <option key={value} value={value}>{text}</option>)}
                    {org.industry === 'other' && <option value="other">Other</option>}
                  </select>
                </div>
                <div>
                  <label htmlFor="timezone" className={label}>Time zone</label>
                  <select id="timezone" name="timezone" defaultValue={org.timezone} className={input}>
                    {!timezoneOptions.us.includes(org.timezone) && !otherTimezoneKnown && <option value={org.timezone}>{org.timezone}</option>}
                    <optgroup label="United States">{timezoneOptions.us.map((timezone) => <option key={timezone}>{timezone}</option>)}</optgroup>
                    <optgroup label="Other">{timezoneOptions.other.map((timezone) => <option key={timezone}>{timezone}</option>)}</optgroup>
                  </select>
                  <p className="mt-2 text-xs text-faint">Used for office hours, appointments, and call timestamps.</p>
                </div>
              </div>
              {!readOnly && <SubmitButton className={btn.primary}>Save changes</SubmitButton>}
              {readOnly && <p className="text-sm text-muted">Ask a workspace admin to update these details.</p>}
            </Card>
          </fieldset>
        </form>

        <div className="grid gap-5">
          <Card className="!p-5">
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold text-ink">Call preferences</h2>
              <p className="mt-1 text-sm text-muted">Current defaults configured for your receptionist.</p>
            </div>
            {agent ? (
              <div className="divide-y divide-line">
                {PREFERENCE_ROWS.map(({ key, label: title, description, icon: Icon }) => (
                  <div key={key} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-primary">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold ${preferences[key] ? 'text-good' : 'text-muted'}`}>
                      {preferences[key] ? 'On' : 'Off'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Set up your receptionist to configure call preferences.</p>
            )}
            <Link href="/dashboard/agent" className={`${btn.secondary} mt-4 w-full`}>
              <Settings2 className="size-4" aria-hidden />
              Manage receptionist settings
            </Link>
          </Card>

          <Card className="!p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">Workspace details</h2>
                <p className="mt-1 text-sm text-muted">Account information and connected lines.</p>
              </div>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-primary">
                <Phone className="size-4" aria-hidden />
              </span>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted">Workspace handle</dt>
                <dd className="mt-1 break-all font-medium text-ink">{org.slug}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted">Industry</dt>
                <dd className="mt-1 font-medium text-ink">{industryLabel}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted">Business phone</dt>
                {numberResult.data?.length ? (
                  <dd className="mt-1 space-y-1">
                    {numberResult.data.map((number) => (
                      <p key={number.e164} className="font-medium text-ink">{number.e164}<span className="ml-2 text-xs font-normal text-muted">{number.status}</span></p>
                    ))}
                    {extraPhoneNumbers > 0 && <p className="text-xs text-muted">And {extraPhoneNumbers} more.</p>}
                  </dd>
                ) : (
                  <dd className="mt-1 text-muted">No phone numbers connected.</dd>
                )}
              </div>
            </dl>
            <Link href="/dashboard/numbers" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
              Manage phone numbers
            </Link>
          </Card>
        </div>
      </div>
    </>
  )
}
