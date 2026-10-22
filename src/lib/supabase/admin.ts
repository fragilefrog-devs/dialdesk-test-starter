import { createClient } from '@supabase/supabase-js'

/** Service-role client — BYPASSES RLS. Only for webhooks, the voice gateway API and admin jobs.
 *  Every query made with it must filter by org_id explicitly. */
export const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
