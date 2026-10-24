import { Resend } from 'resend'
import { emailEnv } from './env'
import { renderEmail, type EmailTemplate, type RenderedEmail } from './email-templates'

export async function sendEmail(to: string, message: RenderedEmail): Promise<boolean> {
  try {
    const config = emailEnv()
    const { data, error } = await new Resend(config.RESEND_API_KEY).emails.send({
      from: config.EMAIL_FROM,
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    })
    if (error || !data?.id) {
      console.error('[email] Provider rejected message', { error: error?.message ?? 'No message id returned' })
      return false
    }
    return true
  } catch (error) {
    console.error('[email] Could not submit message', error instanceof Error ? error.message : error)
    return false
  }
}

export function sendTemplateEmail(to: string, template: EmailTemplate): Promise<boolean> {
  return sendEmail(to, renderEmail(template))
}
