import { requireOrg } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

export async function POST() {
  const { org, role } = await requireOrg()
  if (role === 'member' || !org.stripe_customer_id) return Response.json({ error: 'Not available' }, { status: 403 })
  const session = await stripe().billingPortal.sessions.create({
    customer: org.stripe_customer_id, return_url: `${env().NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  })
  return Response.json({ url: session.url })
}
