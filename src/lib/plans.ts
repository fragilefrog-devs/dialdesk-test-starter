export type PlanId = 'starter' | 'growth' | 'scale'

export interface Plan {
  id: PlanId
  name: string
  priceUsd: number          // monthly — PLACEHOLDER pricing, validate with design partners before launch
  minutes: number           // included call minutes / month
  numbers: number           // included phone numbers
  agents: number
  seats: number
  overageUsdPerMin: number
  priceEnv: 'STRIPE_PRICE_STARTER' | 'STRIPE_PRICE_GROWTH' | 'STRIPE_PRICE_SCALE'
  features: string[]
  highlight?: boolean
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: 'starter', name: 'Starter', priceUsd: 49, minutes: 150, numbers: 1, agents: 1, seats: 2, overageUsdPerMin: 0.35,
    priceEnv: 'STRIPE_PRICE_STARTER',
    features: ['1 AI receptionist', '1 phone number', '150 call minutes', 'Appointment booking', 'Lead capture', 'Email summaries'],
  },
  growth: {
    id: 'growth', name: 'Growth', priceUsd: 149, minutes: 600, numbers: 3, agents: 3, seats: 5, overageUsdPerMin: 0.28,
    priceEnv: 'STRIPE_PRICE_GROWTH', highlight: true,
    features: ['3 AI receptionists', '3 phone numbers', '600 call minutes', 'Human call transfer', 'Website voice widget', 'Priority support'],
  },
  scale: {
    id: 'scale', name: 'Scale', priceUsd: 399, minutes: 2000, numbers: 10, agents: 10, seats: 20, overageUsdPerMin: 0.22,
    priceEnv: 'STRIPE_PRICE_SCALE',
    features: ['10 AI receptionists', '10 phone numbers', '2,000 call minutes', 'Multi-location teams', 'Audit log', 'Onboarding call'],
  },
}

export const TRIAL = { minutes: 30, numbers: 1, agents: 1, seats: 2 }

export function limitsFor(plan: string) {
  if (plan in PLANS) {
    const p = PLANS[plan as PlanId]
    return { minutes: p.minutes, numbers: p.numbers, agents: p.agents, seats: p.seats }
  }
  return TRIAL
}

/** Whether an org may take calls: active/trialing subscription, or an unexpired trial. */
export function canTakeCalls(org: { plan: string; subscription_status: string; trial_ends_at: string }) {
  if (org.plan === 'trial') return new Date(org.trial_ends_at) > new Date()
  return ['active', 'trialing', 'past_due'].includes(org.subscription_status)
}
