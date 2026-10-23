import { requireOrg } from '@/lib/auth'
import { stripe, priceIdFor } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { appEnv } from '@/lib/env'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { org, role, user } = await requireOrg()
  if (role === 'member') return Response.json({ error: 'Only owners/admins can manage billing' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const parsed = z.object({ plan: z.enum(['starter', 'growth', 'scale']) }).safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Invalid plan' }, { status: 400 })
  const plan = parsed.data.plan

  const s = stripe()
  let customer = org.stripe_customer_id
  if (!customer) {
    customer = (await s.customers.create(
      { email: user.email, name: org.name, metadata: { org_id: org.id } },
      { idempotencyKey: `organization:${org.id}` },
    )).id
    const { error } = await supabaseAdmin().from('organizations').update({ stripe_customer_id: customer }).eq('id', org.id)
    if (error) {
      console.error('[billing] Could not save Stripe customer', { organizationId: org.id, error })
      return Response.json({ error: 'Could not initialize billing' }, { status: 500 })
    }
  }
  const session = await s.checkout.sessions.create({
    mode: 'subscription', customer,
    line_items: [{ price: priceIdFor(plan), quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { org_id: org.id } },
    client_reference_id: org.id,
    success_url: `${appEnv().NEXT_PUBLIC_APP_URL}/dashboard/billing?status=success`,
    cancel_url: `${appEnv().NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  })
  return Response.json({ url: session.url })
}
