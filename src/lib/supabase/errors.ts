/**
 * Helpers for telling transport failures apart from rejected credentials.
 *
 * Supabase reports a DNS/TLS/timeout problem as a generic "fetch failed", so
 * without this the UI blames the caller's password for what is really an
 * unreachable or misconfigured Supabase project.
 */

/** Host of the Supabase project the app is currently pointed at. */
export const supabaseHost = () => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host
  } catch {
    return 'unknown'
  }
}

/** True when Supabase Auth failed for transport reasons, not bad credentials. */
export const isTransportError = (error: { message?: string; name?: string } | null | undefined) =>
  !!error && (error.message === 'fetch failed' || error.name === 'AuthRetryableFetchError')

/** Message shown when the app cannot reach Supabase Auth at all. */
export const unreachableAuthMessage = () =>
  `Could not reach Supabase Auth at ${supabaseHost()}. Check NEXT_PUBLIC_SUPABASE_URL in .env.local and your connection.`
