import type Stripe from 'stripe'
import { planFromPriceId } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { syncOrgAgents } from '@/lib/vapi-sync'

export function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const itemPeriodEnd = (subscription.items.data[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end
  const subscriptionPeriodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end
  const timestamp = itemPeriodEnd ?? subscriptionPeriodEnd
  return timestamp ? new Date(timestamp * 1000).toISOString() : null
}

export async function syncActiveSubscription(orgId: string, customerId: string, subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id
  const plan = priceId ? planFromPriceId(priceId) : null
  if (!plan) return { ok: false as const, error: 'Unsupported subscription price.' }

  const { data, error } = await supabaseAdmin()
    .from('organizations')
    .update({
      plan,
      subscription_status: subscription.status,
      stripe_subscription_id: subscription.id,
      current_period_end: subscriptionPeriodEnd(subscription),
    })
    .eq('id', orgId)
    .eq('stripe_customer_id', customerId)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    console.error('[billing] Could not save confirmed subscription', { organizationId: orgId, subscriptionId: subscription.id, error })
    return { ok: false as const, error: 'Could not save the confirmed subscription.' }
  }

  let provisioning: Awaited<ReturnType<typeof syncOrgAgents>>
  try {
    provisioning = await syncOrgAgents(orgId)
  } catch (error) {
    console.error('[billing] Could not sync receptionist settings after subscription update', { organizationId: orgId, error })
    provisioning = { errors: ['Could not sync receptionist settings.'] }
  }
  return { ok: true as const, plan, provisioningErrors: provisioning.errors }
}
