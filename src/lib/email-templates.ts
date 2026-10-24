import type { Hazard, Urgency } from './trades'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export type OwnerNotification =
  | {
      kind: 'booking'
      callerName: string
      callbackNumber: string
      address: string
      postcode: string
      issue: string
      service: string | null
      urgency: Urgency
      date: string
      arrivalWindow: string
    }
  | {
      kind: 'emergency'
      hazard: Hazard
      issue: string
      callerName: string
      callbackNumber: string
      address: string
    }
  | {
      kind: 'lead'
      callerName: string
      callbackNumber: string
      intent: string
      summary: string
      address: string
      postcode: string
      issue: string
      urgency: Urgency
    }

export type EmailTemplate =
  | { kind: 'team-invite'; inviterEmail: string; organizationName: string; inviteUrl: string }
  | { kind: 'booking-confirmation'; organizationName: string; callerName: string; callbackNumber: string; address: string; postcode: string; issue: string; service: string | null; date: string; arrivalWindow: string; timezone: string }
  | { kind: 'owner-notification'; notification: OwnerNotification }

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character])

const cleanSubject = (value: string) => value.replace(/[\r\n]+/g, ' ').trim().slice(0, 180)
const detail = (label: string, value: string | null | undefined) =>
  value
    ? `<tr><td style="padding:8px 12px 8px 0;color:#626b78;vertical-align:top">${escapeHtml(label)}</td><td style="padding:8px 0;color:#202733">${escapeHtml(value)}</td></tr>`
    : ''

function layout(title: string, preheader: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f4f6f8;color:#202733;font-family:Arial,Helvetica,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e3e7ec;border-radius:12px">
          <tr><td style="padding:24px 28px 12px;font-size:18px;font-weight:700;color:#202733">DialDesk</td></tr>
          <tr><td style="padding:12px 28px 28px">
            <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#202733">${escapeHtml(title)}</h1>
            ${body}
            <p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:#737d89">This is an automated message from DialDesk.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

function renderInvite(template: Extract<EmailTemplate, { kind: 'team-invite' }>): RenderedEmail {
  const subject = cleanSubject(`${template.organizationName} invited you to DialDesk`)
  const body = `<p style="font-size:15px;line-height:1.6;color:#394351">${escapeHtml(template.inviterEmail)} invited you to join ${escapeHtml(template.organizationName)}.</p>
    <p style="margin:24px 0"><a href="${escapeHtml(template.inviteUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#6657e8;color:#fff;text-decoration:none;font-weight:700">Accept invitation</a></p>
    <p style="font-size:14px;line-height:1.5;color:#626b78">This invitation expires in 7 days. If you were not expecting it, you can ignore this email.</p>`
  return {
    subject,
    html: layout('You are invited', `Join ${template.organizationName} on DialDesk`, body),
    text: `${template.inviterEmail} invited you to join ${template.organizationName} on DialDesk.\n\nAccept the invitation: ${template.inviteUrl}\n\nThis invitation expires in 7 days. If you were not expecting it, you can ignore this email.`,
  }
}

function renderBookingConfirmation(template: Extract<EmailTemplate, { kind: 'booking-confirmation' }>): RenderedEmail {
  const subject = cleanSubject(`Your ${template.organizationName} service visit is booked`)
  const body = `<p style="font-size:15px;line-height:1.6;color:#394351">Hi ${escapeHtml(template.callerName)}, your service visit with ${escapeHtml(template.organizationName)} is booked.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:16px 0;font-size:14px;line-height:1.5">
      ${detail('Date', template.date)}
      ${detail('Arrival window', `${template.arrivalWindow} (${template.timezone})`)}
      ${detail('Service', template.service)}
      ${detail('Address', `${template.address}, ${template.postcode}`)}
      ${detail('Issue', template.issue)}
      ${detail('Callback number', template.callbackNumber)}
    </table>
    <p style="font-size:14px;line-height:1.5;color:#626b78">A technician will arrive during the arrival window, not at a guaranteed exact time. Contact the business directly if you need to change your appointment.</p>`
  return {
    subject,
    html: layout('Your visit is booked', `Appointment details for ${template.organizationName}`, body),
    text: [
      `Hi ${template.callerName}, your service visit with ${template.organizationName} is booked.`,
      '',
      `Date: ${template.date}`,
      `Arrival window: ${template.arrivalWindow} (${template.timezone})`,
      template.service ? `Service: ${template.service}` : '',
      `Address: ${template.address}, ${template.postcode}`,
      `Issue: ${template.issue}`,
      `Callback number: ${template.callbackNumber}`,
      '',
      'A technician will arrive during the arrival window, not at a guaranteed exact time. Contact the business directly if you need to change your appointment.',
    ].filter(Boolean).join('\n'),
  }
}

function notificationContent(notification: OwnerNotification): { subject: string; title: string; intro: string; rows: [string, string | null][] } {
  switch (notification.kind) {
    case 'booking':
      return {
        subject: `New job booked: ${notification.callerName}`,
        title: 'New job booked',
        intro: 'A service visit was booked.',
        rows: [
          ['Caller', notification.callerName],
          ['Callback number', notification.callbackNumber],
          ['Service', notification.service],
          ['Issue', notification.issue],
          ['Address', `${notification.address}, ${notification.postcode}`],
          ['Arrival window', `${notification.arrivalWindow} on ${notification.date}`],
          ['Urgency', notification.urgency],
        ],
      }
    case 'emergency':
      return {
        subject: `Emergency alert: ${notification.hazard}`,
        title: 'Emergency alert',
        intro: 'A caller reported an emergency that needs review.',
        rows: [
          ['Hazard', notification.hazard],
          ['Issue', notification.issue],
          ['Caller', notification.callerName || 'Unknown'],
          ['Callback number', notification.callbackNumber || 'Not provided'],
          ['Address', notification.address || 'Not provided'],
        ],
      }
    case 'lead':
      return {
        subject: `${notification.urgency === 'emergency' ? 'Urgent message' : 'New message'}: ${notification.callerName}`,
        title: notification.urgency === 'emergency' ? 'Urgent message' : 'New caller message',
        intro: 'A caller left a message for your team.',
        rows: [
          ['Caller', notification.callerName],
          ['Callback number', notification.callbackNumber],
          ['Reason', notification.intent],
          ['Summary', notification.summary],
          ['Issue', notification.issue],
          ['Address', notification.address && notification.postcode ? `${notification.address}, ${notification.postcode}` : notification.address || notification.postcode],
          ['Urgency', notification.urgency],
        ],
      }
  }
}

export function renderOwnerNotificationEmail(notification: OwnerNotification): RenderedEmail {
  const content = notificationContent(notification)
  const rows = content.rows.map(([label, value]) => detail(label, value)).join('')
  const plainText = [content.intro, '', ...content.rows.filter((row): row is [string, string] => !!row[1]).map(([label, value]) => `${label}: ${value}`)].join('\n')
  return {
    subject: cleanSubject(content.subject),
    html: layout(content.title, content.intro, `<p style="font-size:15px;line-height:1.6;color:#394351">${escapeHtml(content.intro)}</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:16px 0;font-size:14px;line-height:1.5">${rows}</table>`),
    text: plainText,
  }
}

export function renderEmail(template: EmailTemplate): RenderedEmail {
  switch (template.kind) {
    case 'team-invite':
      return renderInvite(template)
    case 'booking-confirmation':
      return renderBookingConfirmation(template)
    case 'owner-notification':
      return renderOwnerNotificationEmail(template.notification)
  }
}

export function ownerNotificationText(notification: OwnerNotification): string {
  const email = renderOwnerNotificationEmail(notification)
  return `${email.subject}\n${email.text}`
}

export function parseConsentedEmail(email: unknown, consent: unknown): { email: string | null; error?: string } {
  if (consent !== true) return { email: null }
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { email: null, error: 'A valid email address is required for the confirmation.' }
  }
  return { email: normalized }
}
