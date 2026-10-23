import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { stripeEnv } from '@/lib/env'
import { syncActiveSubscription } from '@/lib/billing-sync'
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
    const deleted = event.type === 'customer.subscription.deleted'
    if (deleted) {
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      const { data: org, error } = await db.from('organizations').update({
        plan: 'trial',
        subscription_status: 'canceled',
        stripe_subscription_id: null,
        current_period_end: null,
      }).eq('stripe_customer_id', customerId).eq('stripe_subscription_id', sub.id).select('id').maybeSingle()
      if (error) {
        console.error('[stripe] Failed to update canceled subscription', { eventId: event.id, error })
        return new Response('Could not process subscription event', { status: 500 })
      }
      if (org) {
        const sync = await syncOrgAgents(org.id)
        if (sync.errors.length) {
          console.error('[stripe] Canceled subscription saved but receptionist sync failed', { eventId: event.id, organizationId: org.id, errors: sync.errors })
          return new Response('Subscription saved but receptionist sync failed', { status: 500 })
        }
      }
    } else if (['active', 'trialing', 'past_due'].includes(sub.status)) {
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      const { data: org, error } = await db.from('organizations').select('id').eq('stripe_customer_id', customerId).maybeSingle()
      if (error || !org || (sub.metadata.org_id && sub.metadata.org_id !== org.id)) {
        console.error('[stripe] Could not resolve subscription workspace', { eventId: event.id, customerId, error })
        return new Response('Could not resolve subscription workspace', { status: 500 })
      }
      const sync = await syncActiveSubscription(org.id, customerId, sub)
      if (!sync.ok) {
        console.error('[stripe] Failed to update subscription', { eventId: event.id, error: sync.error })
        return new Response(sync.error, { status: 500 })
      }
      if (sync.provisioningErrors.length) {
        console.error('[stripe] Subscription saved but receptionist sync failed', { eventId: event.id, organizationId: org.id, errors: sync.provisioningErrors })
        return new Response('Subscription saved but receptionist sync failed', { status: 500 })
      }
    }
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
