import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Clock3, Phone, Wrench } from 'lucide-react'
import { PublicCallWindow } from '@/components/PublicCallWindow'
import { Wordmark } from '@/components/marketing'
import { canTakeCalls } from '@/lib/plans'
import { formatBusinessHours, publicServices } from '@/lib/public-business'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { WIDGET_ACCENT_RE } from '@/lib/widget'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Business' }

const industryNames: Record<string, string> = {
  plumbing: 'Plumbing',
  hvac: 'Heating & cooling',
  plumbing_hvac: 'Plumbing & HVAC',
  other: 'Home services',
}

function DataUnavailable() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-5 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-2xl font-bold text-ink">Business details are temporarily unavailable</h1>
        <p className="mt-2 text-sm text-muted">Please refresh this page in a moment.</p>
      </div>
    </main>
  )
}

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = supabaseAdmin()
  const { data: organization, error: organizationError } = await db
    .from('organizations')
    .select('id, name, slug, industry, timezone, plan, subscription_status, trial_ends_at')
    .eq('slug', slug)
    .maybeSingle()

  if (organizationError) {
    console.error('Public business page: could not load organization', organizationError)
    return <DataUnavailable />
  }
  if (!organization) notFound()

  const [{ data: agent, error: agentError }, { data: phone, error: phoneError }] = await Promise.all([
    db.from('agents')
      .select('services, business_hours, is_active, vapi_assistant_id, widget_enabled, widget_token, widget_accent')
      .eq('org_id', organization.id)
      .order('created_at')
      .limit(1)
      .maybeSingle(),
    db.from('phone_numbers')
      .select('e164')
      .eq('org_id', organization.id)
      .eq('status', 'active')
      .order('created_at')
      .limit(1)
      .maybeSingle(),
  ])

  if (agentError) {
    console.error('Public business page: could not load receptionist details', agentError)
    return <DataUnavailable />
  }
  if (phoneError) console.error('Public business page: could not load phone number', phoneError)

  const services = publicServices(agent?.services)
  const hours = formatBusinessHours(agent?.business_hours)
  const timezone = organization.timezone || 'Local time'
  const callAvailable = Boolean(
    agent?.widget_enabled &&
    agent.is_active &&
    agent.vapi_assistant_id &&
    agent.widget_token &&
    process.env.VAPI_PUBLIC_KEY &&
    canTakeCalls(organization),
  )
  const accent = agent?.widget_accent && WIDGET_ACCENT_RE.test(agent.widget_accent) ? agent.widget_accent : '#6657e8'
  const widgetToken = agent?.widget_token
  const callSrc = callAvailable && widgetToken
    ? `/embed/${encodeURIComponent(widgetToken)}?accent=${encodeURIComponent(accent)}`
    : null

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8 sm:py-7">
        <header className="flex items-center justify-between border-b border-line pb-5">
          <Link href="/" aria-label="DialDesk home" className="rounded-lg">
            <Wordmark />
          </Link>
          <span className="text-xs font-medium text-muted">Business information</span>
        </header>

        <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)] lg:gap-12 lg:py-12">
          <section className="min-w-0">
            <p className="text-sm font-semibold text-primary">{industryNames[organization.industry] ?? industryNames.other}</p>
            <h1 className="mt-3 max-w-3xl font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
              {organization.name}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
              Get help from {organization.name}. Ask about services, share what you need, or request an appointment with the voice receptionist.
            </p>

            <section aria-labelledby="services-heading" className="mt-9 rounded-[15px] border border-line bg-surface p-5 shadow-card sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-primary">
                  <Wrench className="size-5" aria-hidden />
                </span>
                <div>
                  <h2 id="services-heading" className="font-display text-lg font-bold text-ink">Services</h2>
                  <p className="text-sm text-muted">What this business can help with</p>
                </div>
              </div>
              {services.length ? (
                <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                  {services.map((service) => (
                    <li key={service} className="flex min-h-11 items-center rounded-[10px] border border-line bg-canvas px-3.5 text-sm text-ink">
                      {service}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-5 rounded-[10px] bg-surface-2 px-4 py-3 text-sm text-muted">Contact the business to learn more about available services.</p>
              )}
            </section>

            <section aria-labelledby="hours-heading" className="mt-5 rounded-[15px] border border-line bg-surface p-5 shadow-card sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-primary">
                  <Clock3 className="size-5" aria-hidden />
                </span>
                <div>
                  <h2 id="hours-heading" className="font-display text-lg font-bold text-ink">Service hours</h2>
                  <p className="text-sm text-muted">All times {timezone}</p>
                </div>
              </div>
              {hours.length ? (
                <dl className="mt-4 divide-y divide-line">
                  {hours.map(({ day, hours: dayHours }) => (
                    <div key={day} className="flex min-h-10 items-center justify-between gap-4 py-2 text-sm">
                      <dt className="font-medium text-ink">{day}</dt>
                      <dd className={dayHours === 'Closed' ? 'text-muted' : 'tabular-nums text-ink'}>{dayHours}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-5 rounded-[10px] bg-surface-2 px-4 py-3 text-sm text-muted">Hours are not posted. Please call to confirm availability.</p>
              )}
            </section>

            {phoneError ? (
              <p role="status" className="mt-5 rounded-[10px] border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
                Phone contact details could not be loaded. Please refresh this page to try again.
              </p>
            ) : phone?.e164 && (
              <a href={`tel:${phone.e164}`} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-2">
                <Phone className="size-4 text-primary" aria-hidden />
                Call {phone.e164}
              </a>
            )}
          </section>

          <aside className="min-w-0 lg:sticky lg:top-8 lg:self-start">
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">AI voice receptionist</p>
              <h2 className="mt-1 font-display text-xl font-bold text-ink">Talk with {organization.name}</h2>
              <p className="mt-1 text-sm text-muted">Ask a question or request an appointment.</p>
            </div>
            {callSrc ? (
              <PublicCallWindow src={callSrc} businessName={organization.name} />
            ) : (
              <div className="grid min-h-[480px] place-items-center rounded-[15px] border border-line bg-surface p-6 text-center shadow-card">
                <div className="max-w-xs">
                  <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
                    <Phone className="size-6" aria-hidden />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-bold text-ink">Voice calls aren’t available right now</h3>
                  <p className="mt-1 text-sm text-muted">
                    {phoneError
                      ? 'Phone contact details are temporarily unavailable. Please refresh this page.'
                      : phone?.e164
                        ? 'Please call the business directly.'
                        : 'Please contact the business to ask about services and availability.'}
                  </p>
                  {!phoneError && phone?.e164 && (
                    <a href={`tel:${phone.e164}`} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
                      <Phone className="size-4" aria-hidden />
                      Call {phone.e164}
                    </a>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
        <footer className="border-t border-line py-5 text-center text-xs text-faint">Powered by DialDesk</footer>
      </div>
    </main>
  )
}
