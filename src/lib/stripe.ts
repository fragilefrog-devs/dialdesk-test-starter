import Stripe from 'stripe'
import { stripeEnv } from './env'
import { PLANS, type PlanId } from './plans'

let client: Stripe | null = null
export const stripe = () => (client ??= new Stripe(stripeEnv().STRIPE_SECRET_KEY))

export const priceIdFor = (plan: PlanId) => stripeEnv()[PLANS[plan].priceEnv]

export function planFromPriceId(priceId: string): PlanId | null {
  const e = stripeEnv()
  for (const p of Object.values(PLANS)) if (e[p.priceEnv] === priceId) return p.id
  return null
}
