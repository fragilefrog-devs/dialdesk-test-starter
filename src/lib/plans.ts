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
    id: 'starter', name: 'Solo', priceUsd: 79, minutes: 150, numbers: 1, agents: 1, seats: 2, overageUsdPerMin: 0.45,
    priceEnv: 'STRIPE_PRICE_STARTER',
    features: ['1 phone number', '150 call minutes', 'Emergency triage and text alerts', 'Job booking by arrival window', 'Missed-call messages by text'],
  },
  growth: {
    id: 'growth', name: 'Crew', priceUsd: 179, minutes: 450, numbers: 2, agents: 1, seats: 6, overageUsdPerMin: 0.38,
    priceEnv: 'STRIPE_PRICE_GROWTH', highlight: true,
    features: ['2 phone numbers', '450 call minutes', 'On-call transfer for emergencies', 'Several jobs per window', 'Team seats and call recordings'],
  },
  scale: {
    id: 'scale', name: 'Fleet', priceUsd: 349, minutes: 1200, numbers: 5, agents: 3, seats: 20, overageUsdPerMin: 0.30,
    priceEnv: 'STRIPE_PRICE_SCALE',
    features: ['5 phone numbers', '1,200 call minutes', 'Multiple receptionists and locations', 'Audit log', 'Setup call with us'],
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
