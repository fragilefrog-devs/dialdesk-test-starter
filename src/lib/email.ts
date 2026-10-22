import { Resend } from 'resend'
import { env } from './env'

export async function sendEmail(to: string, subject: string, html: string) {
  try {
    await new Resend(env().RESEND_API_KEY).emails.send({ from: env().EMAIL_FROM, to, subject, html })
  } catch (e) { console.error('[email]', e) }
}
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
