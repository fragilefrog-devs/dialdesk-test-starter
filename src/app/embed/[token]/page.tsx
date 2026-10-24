import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { EmbedVoice } from '@/components/EmbedVoice'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { appEnv } from '@/lib/env'
import { canTakeCalls } from '@/lib/plans'
import { refererAllowed, WIDGET_ACCENT_RE, WIDGET_TOKEN_RE } from '@/lib/widget'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Talk to us', robots: { index: false, follow: false } }

function Unavailable() {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div><h1 className="font-display text-2xl text-ink">Voice chat is unavailable</h1><p className="mt-2 text-sm text-muted">Please call us on the phone number listed on this website.</p></div>
    </main>
  )
}

/**
 * Framed by customer sites through /widget.js. The assistant id and public key are only sent to the browser
 * when the business enabled the widget, is active, and the embedding site is on its allowed list.
 */
export default async function Embed({ params, searchParams }: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ accent?: string }>
}) {
  const [{ token }, { accent: requestedAccent }] = await Promise.all([params, searchParams])
  const accent = requestedAccent && WIDGET_ACCENT_RE.test(requestedAccent) ? requestedAccent : '#6657e8'
  const publicKey = process.env.VAPI_PUBLIC_KEY
  if (!WIDGET_TOKEN_RE.test(token) || !publicKey) return <Unavailable />
  const db = supabaseAdmin()
  const { data: agent } = await db.from('agents')
    .select('org_id, vapi_assistant_id, is_active, widget_enabled, widget_domains').eq('widget_token', token).maybeSingle()
  if (!agent?.widget_enabled || !agent.is_active || !agent.vapi_assistant_id) return <Unavailable />
  const { data: org } = await db.from('organizations').select('name, plan, subscription_status, trial_ends_at').eq('id', agent.org_id).single()
  if (!org || !canTakeCalls(org)) return <Unavailable />
  const ownHost = new URL(appEnv().NEXT_PUBLIC_APP_URL).hostname
  if (!refererAllowed((await headers()).get('referer'), agent.widget_domains as string[], ownHost)) return <Unavailable />
  return <EmbedVoice publicKey={publicKey} assistantId={agent.vapi_assistant_id} businessName={org.name} accent={accent} />
}
