import { z } from 'zod'

/**
 * Environment is validated per integration so a route that only needs one
 * service never fails because an unrelated service is unconfigured.
 * Every accessor throws a readable error naming each missing variable.
 */
const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_STARTER: z.string().min(1),
  STRIPE_PRICE_GROWTH: z.string().min(1),
  STRIPE_PRICE_SCALE: z.string().min(1),

  // Voice runtime: Vapi
  VAPI_API_KEY: z.string().min(1),
  // Shared secret Vapi sends with every server message (Bearer token or X-Vapi-Secret)
  VAPI_WEBHOOK_SECRET: z.string().min(16),
  // Optional: id of a Vapi custom credential holding the same secret (preferred over inline secret)
  VAPI_SERVER_CREDENTIAL_ID: z.string().min(1).optional(),
  VAPI_MODEL_PROVIDER: z.string().min(1).default('openai'),
  VAPI_MODEL: z.string().min(1).default('gpt-4o'),
  VAPI_VOICE_PROVIDER: z.string().min(1).default('openai'),
  VAPI_TRANSCRIBER_PROVIDER: z.string().min(1).default('deepgram'),
  VAPI_TRANSCRIBER_MODEL: z.string().min(1).default('nova-2'),

  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  ADMIN_EMAILS: z.string().default(''),
})
export type Env = z.infer<typeof schema>

/** Builds a validating accessor for a subset of the schema. */
const scoped = <S extends z.ZodTypeAny>(scopedSchema: S) => {
  let cache: z.infer<S> | null = null
  return (): z.infer<S> => {
    if (cache) return cache
    const parsed = scopedSchema.safeParse(process.env)
    if (!parsed.success) {
      const bad = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
      throw new Error(`Invalid or missing environment variables: ${bad}`)
    }
    cache = parsed.data
    return cache
  }
}

/** Everything configured. Use only where the whole surface is required. */
export const env = scoped(schema)
export const appEnv = scoped(schema.pick({ NEXT_PUBLIC_APP_URL: true }))
export const supabaseEnv = scoped(schema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true, NEXT_PUBLIC_SUPABASE_ANON_KEY: true, SUPABASE_SERVICE_ROLE_KEY: true,
}))
export const stripeEnv = scoped(schema.pick({
  STRIPE_SECRET_KEY: true, STRIPE_WEBHOOK_SECRET: true,
  STRIPE_PRICE_STARTER: true, STRIPE_PRICE_GROWTH: true, STRIPE_PRICE_SCALE: true,
}))
export const vapiEnv = scoped(schema.pick({
  VAPI_API_KEY: true, VAPI_WEBHOOK_SECRET: true, VAPI_SERVER_CREDENTIAL_ID: true,
  VAPI_MODEL_PROVIDER: true, VAPI_MODEL: true, VAPI_VOICE_PROVIDER: true,
  VAPI_TRANSCRIBER_PROVIDER: true, VAPI_TRANSCRIBER_MODEL: true,
}).extend({ NEXT_PUBLIC_APP_URL: z.string().url() }))
export const emailEnv = scoped(schema.pick({ RESEND_API_KEY: true, EMAIL_FROM: true, ADMIN_EMAILS: true }))

/** SMS is optional: without these, owner alerts fall back to email only. */
export const smsConfig = () => {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_SMS_FROM
  return sid && token && from ? { sid, token, from } : null
}

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
