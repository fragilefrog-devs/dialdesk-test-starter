import { supabaseAdmin } from './supabase/admin'
import { sendSms } from './sms'
import { sendEmail, escapeHtml } from './email'

/** Alerts the business owner/dispatcher by SMS and/or email. Best-effort: failures are logged, never thrown. */
export async function notifyOwner(orgId: string, agentId: string | null, subject: string, text: string) {
  const db = supabaseAdmin()
  const { data: agent } = await db.from('agents').select('notify_phone, notify_email, transfer_number')
    .eq('org_id', orgId).eq('id', agentId ?? '').maybeSingle()
  if (!agent) return { sms: false, email: false }
  const phone = agent.notify_phone || agent.transfer_number
  const [sms, email] = await Promise.all([
    phone ? sendSms(phone, `${subject}\n${text}`) : Promise.resolve(false),
    agent.notify_email ? sendEmail(agent.notify_email, subject, `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`).then(() => true, () => false) : Promise.resolve(false),
  ])
  return { sms, email }
}
