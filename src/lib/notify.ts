import { supabaseAdmin } from './supabase/admin'
import { sendSms } from './sms'
import { sendTemplateEmail } from './email'
import { ownerNotificationText, type OwnerNotification } from './email-templates'

/** Alerts the business owner/dispatcher by SMS and/or email. Best-effort: failures are logged, never thrown. */
export async function notifyOwner(orgId: string, agentId: string | null, notification: OwnerNotification) {
  const db = supabaseAdmin()
  const { data: agent } = await db.from('agents').select('notify_phone, notify_email, transfer_number')
    .eq('org_id', orgId).eq('id', agentId ?? '').maybeSingle()
  if (!agent) return { sms: false, email: false }
  const phone = agent.notify_phone || agent.transfer_number
  const smsText = ownerNotificationText(notification)
  const [sms, email] = await Promise.all([
    phone ? sendSms(phone, smsText) : Promise.resolve(false),
    agent.notify_email
      ? sendTemplateEmail(agent.notify_email, { kind: 'owner-notification', notification })
      : Promise.resolve(false),
  ])
  return { sms, email }
}
