import { z } from 'zod'

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OLLAMA_BASE_URL: z.string().url().default('http://127.0.0.1:11434/v1'),
  OLLAMA_MODEL: z.string().default('gemma3:1b'),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_STARTER: z.string().min(1),
  STRIPE_PRICE_GROWTH: z.string().min(1),
  STRIPE_PRICE_SCALE: z.string().min(1),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  VOICE_GATEWAY_URL: z.string().url(),
  VOICE_GATEWAY_WEB_URL: z.string().url().optional(),
  INTERNAL_API_SECRET: z.string().min(32),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  ADMIN_EMAILS: z.string().default(''),
})
export type Env = z.infer<typeof schema>

let cached: Env | null = null

/** Validated server env. Throws a readable error naming every missing variable. */
export function env(): Env {
  if (cached) return cached
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const bad = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Invalid or missing environment variables: ${bad}`)
  }
  cached = parsed.data
  return cached
}

/* ── Scoped accessors ─────────────────────────────────────────────────
 * `env()` above validates the WHOLE app surface: it is the "everything
 * is configured" accessor and stays strict for billing / telephony
 * routes. The blast-radius problem it creates is that a route which
 * only needs the voice gateway still dies because Stripe is missing.
 *
 * Each integration therefore gets its own accessor that validates ONLY
 * its own subset, with the same "throw naming every missing variable"
 * behaviour as `env()`.
 *
 * The scoped schemas are DERIVED from `schema` with pick()/extend(), so
 * the full schema and the scoped schemas cannot drift: a key that is
 * renamed, re-typed or relaxed in `schema` is renamed, re-typed or
 * relaxed here automatically. No env var names are duplicated as
 * string literals.
 * ------------------------------------------------------------------- */

const voiceSchema = schema.pick({
  VOICE_GATEWAY_URL: true,
  VOICE_GATEWAY_WEB_URL: true,
})

const supabaseSchema = schema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
  SUPABASE_SERVICE_ROLE_KEY: true,
}).extend({
  // Deliberately NOT in the full schema: adding it there would make
  // `env()` start rejecting an empty publishable key, i.e. change the
  // behaviour of `env()` itself.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
})

const stripeSchema = schema.pick({
  STRIPE_SECRET_KEY: true,
  STRIPE_WEBHOOK_SECRET: true,
  STRIPE_PRICE_STARTER: true,
  STRIPE_PRICE_GROWTH: true,
  STRIPE_PRICE_SCALE: true,
})

const twilioSchema = schema.pick({
  TWILIO_ACCOUNT_SID: true,
  TWILIO_AUTH_TOKEN: true,
})

const emailSchema = schema.pick({
  RESEND_API_KEY: true,
  EMAIL_FROM: true,
  ADMIN_EMAILS: true,
})

const internalSchema = schema.pick({
  INTERNAL_API_SECRET: true,
})

const appSchema = schema.pick({ NEXT_PUBLIC_APP_URL: true })

/** Builds a validating accessor for one scoped schema. Same throw format as `env()`. */
const scoped = <S extends z.ZodTypeAny>(scopedSchema: S) => {
  let scopedCache: z.infer<S> | null = null
  return (): z.infer<S> => {
    if (scopedCache) return scopedCache
    const parsed = scopedSchema.safeParse(process.env)
    if (!parsed.success) {
      const bad = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
      throw new Error(`Invalid or missing environment variables: ${bad}`)
    }
    scopedCache = parsed.data
    return scopedCache
  }
}

/** Voice gateway only (VOICE_GATEWAY_URL, VOICE_GATEWAY_WEB_URL). */
export const voiceEnv = scoped(voiceSchema)
/** Supabase only. */
export const supabaseEnv = scoped(supabaseSchema)
/** Stripe only. */
export const stripeEnv = scoped(stripeSchema)
/** Twilio only. */
export const twilioEnv = scoped(twilioSchema)
/** Resend email only. */
export const emailEnv = scoped(emailSchema)
/** Shared gateway<->server secret only. */
export const internalEnv = scoped(internalSchema)
/** Public app URL only (webhooks, Twilio callback URLs). */
export const appEnv = scoped(appSchema)

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
