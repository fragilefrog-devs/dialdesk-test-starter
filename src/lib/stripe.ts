import Stripe from 'stripe'
import { env } from './env'
import { PLANS, type PlanId } from './plans'

let client: Stripe | null = null
export const stripe = () => (client ??= new Stripe(env().STRIPE_SECRET_KEY))

export const priceIdFor = (plan: PlanId) => env()[PLANS[plan].priceEnv]

export function planFromPriceId(priceId: string): PlanId | null {
  const e = env()
  for (const p of Object.values(PLANS)) if (e[p.priceEnv] === priceId) return p.id
  return null
}
