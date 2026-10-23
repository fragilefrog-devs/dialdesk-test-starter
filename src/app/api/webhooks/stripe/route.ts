import type Stripe from 'stripe'
import { stripe, planFromPriceId } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { stripeEnv } from '@/lib/env'
import { syncOrgAgents } from '@/lib/vapi-sync'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const raw = await req.text()
  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(raw, req.headers.get('stripe-signature') ?? '', stripeEnv().STRIPE_WEBHOOK_SECRET)
  } catch {
    return new Response('Bad signature', { status: 400 })
  }

  const db = supabaseAdmin()

  if (event.type.startsWith('customer.subscription.')) {
    const sub = event.data.object as Stripe.Subscription
    const priceId = sub.items.data[0]?.price.id
    const plan = priceId ? planFromPriceId(priceId) : null
    const deleted = event.type === 'customer.subscription.deleted'
    if (!deleted && !plan) {
      console.error('[stripe] Unsupported subscription price', { eventId: event.id, priceId })
      return new Response('Unsupported subscription price', { status: 500 })
    }
    const periodEnd = (sub.items.data[0] as unknown as { current_period_end?: number })?.current_period_end
      ?? (sub as unknown as { current_period_end?: number }).current_period_end
    const { data: org, error } = await db.from('organizations').update({
      plan: deleted ? 'trial' : plan!,
      subscription_status: deleted ? 'canceled' : sub.status,
      stripe_subscription_id: deleted ? null : sub.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    }).eq('stripe_customer_id', String(sub.customer)).select('id').maybeSingle()
    if (error || !org) {
      console.error('[stripe] Failed to update subscription', { eventId: event.id, error })
      return new Response('Could not process subscription event', { status: 500 })
    }
    // Attach or detach the org's phone numbers to match its new billing state
    await syncOrgAgents(org.id)
  }

  // Record only after side effects succeed so Stripe retries can recover from
  // transient database errors instead of treating an unprocessed event as done.
  const { error } = await db.from('stripe_events').insert({ id: event.id, type: event.type })
  if (error?.code === '23505') return new Response('duplicate', { status: 200 })
  if (error) {
    console.error('[stripe] Failed to record event', { eventId: event.id, error })
    return new Response('Could not record event', { status: 500 })
  }
  return new Response('ok')
}
