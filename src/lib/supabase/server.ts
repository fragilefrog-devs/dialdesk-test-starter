import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseHost } from './errors'

/** RLS-enforced client bound to the signed-in user. Use this by default. */
export async function supabaseServer() {
  const store = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input)
        const isSignup = new URL(url).pathname.endsWith('/auth/v1/signup')
        let retries = 0
        while (true) {
          try {
            return await fetch(input instanceof Request ? input.clone() : input, init)
          } catch (error) {
            const cause = error instanceof Error ? error.cause : undefined
            const details = typeof cause === 'object' && cause !== null
              ? cause as { name?: unknown; code?: unknown }
              : {}
            const retryable = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT'].includes(String(details.code))
            if (isSignup && retryable && retries === 0) {
              retries += 1
              await new Promise((resolve) => setTimeout(resolve, 200))
              continue
            }
            if (isSignup) {
              console.error('[auth] Supabase signup transport failed', {
                host: supabaseHost(),
                errorName: error instanceof Error ? error.name : typeof error,
                causeName: details.name,
                causeCode: details.code,
                retries,
              })
            }
            throw error
          }
        }
      },
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)) } catch { /* called from a Server Component */ }
      },
    },
  })
}
