import { supabaseAdmin } from '@/lib/supabase/admin'
export const dynamic = 'force-dynamic'
export async function GET() {
  const { error } = await supabaseAdmin().from('organizations').select('id', { head: true }).limit(1)
  if (error) console.error('[health] Supabase readiness check failed', error)
  return Response.json({ ok: !error, ts: Date.now() }, { status: error ? 503 : 200 })
}
