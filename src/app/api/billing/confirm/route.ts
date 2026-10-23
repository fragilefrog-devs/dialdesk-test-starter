import type Stripe from 'stripe'
import { z } from 'zod'
import { requireOrg } from '@/lib/auth'
import { stripe, planFromPriceId } from '@/lib/stripe'
import { syncActiveSubscription } from '@/lib/billing-sync'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ checkoutSessionId: z.string().startsWith('cs_').optional() })

function stripeId(value: string | { id: string } | null) {
  return typeof value === 'string' ? value : value?.id ?? null
}

function isUsableSubscription(subscription: Stripe.Subscription) {
  return ['active', 'trialing', 'past_due'].includes(subscription.status)
}

export async function POST(req: Request) {
  const { org, role } = await requireOrg()
  if (role === 'member') return Response.json({ error: 'Only owners/admins can manage billing' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Invalid billing confirmation request' }, { status: 400 })
  if (!org.stripe_customer_id) return Response.json({ error: 'Billing customer is not configured' }, { status: 409 })

  const client = stripe()
  let subscription: Stripe.Subscription | null = null

  if (parsed.data.checkoutSessionId) {
    let session: Stripe.Checkout.Session
    try {
      session = await client.checkout.sessions.retrieve(parsed.data.checkoutSessionId, { expand: ['subscription'] })
    } catch (error) {
      console.error('[billing] Could not retrieve checkout session', { organizationId: org.id, error })
      return Response.json({ error: 'Could not verify the checkout session' }, { status: 502 })
    }
    if (
      session.mode !== 'subscription'
      || session.client_reference_id !== org.id
      || session.metadata?.org_id !== org.id
      || stripeId(session.customer) !== org.stripe_customer_id
    ) {
      return Response.json({ error: 'Checkout session does not belong to this workspace' }, { status: 403 })
    }

    if (session.status !== 'complete' || !['paid', 'no_payment_required'].includes(session.payment_status)) {
      return Response.json({ status: 'pending' }, { status: 202 })
    }

    const checkoutSubscription = session.subscription
    try {
      subscription = typeof checkoutSubscription === 'string'
        ? await client.subscriptions.retrieve(checkoutSubscription)
        : checkoutSubscription
    } catch (error) {
      console.error('[billing] Could not retrieve checkout subscription', { organizationId: org.id, error })
      return Response.json({ error: 'Could not verify the subscription' }, { status: 502 })
    }
    if (!subscription) return Response.json({ status: 'pending' }, { status: 202 })

    if (
      stripeId(subscription.customer) !== org.stripe_customer_id
      || subscription.metadata.org_id !== org.id
      || !isUsableSubscription(subscription)
    ) {
      return Response.json({ status: 'pending' }, { status: 202 })
    }

    const priceId = subscription.items.data[0]?.price.id
    const plan = priceId ? planFromPriceId(priceId) : null
    if (!plan || session.metadata.plan !== plan) {
      console.error('[billing] Checkout confirmation plan mismatch', { organizationId: org.id, sessionId: session.id, subscriptionId: subscription.id })
      return Response.json({ error: 'Could not verify the selected plan' }, { status: 409 })
    }
  } else {
    let subscriptions: Stripe.ApiList<Stripe.Subscription>
    try {
      subscriptions = await client.subscriptions.list({
        customer: org.stripe_customer_id,
        status: 'all',
        limit: 10,
      })
    } catch (error) {
      console.error('[billing] Could not refresh subscription from Stripe', { organizationId: org.id, error })
      return Response.json({ error: 'Could not refresh billing status' }, { status: 502 })
    }
    subscription = subscriptions.data
      .filter((candidate) =>
        isUsableSubscription(candidate)
        && (!candidate.metadata.org_id || candidate.metadata.org_id === org.id),
      )
      .sort((a, b) => b.created - a.created)[0] ?? null
  }

  if (!subscription) return Response.json({ status: 'synced', plan: org.plan, subscriptionStatus: org.subscription_status })

  const result = await syncActiveSubscription(org.id, org.stripe_customer_id, subscription)
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 })
  if (result.provisioningErrors.length) {
    console.error('[billing] Plan saved but receptionist provisioning is pending', {
      organizationId: org.id,
      subscriptionId: subscription.id,
      errors: result.provisioningErrors,
    })
  }
  return Response.json({
    status: 'synced',
    plan: result.plan,
    subscriptionStatus: subscription.status,
    provisioningPending: result.provisioningErrors.length > 0,
  })
}
