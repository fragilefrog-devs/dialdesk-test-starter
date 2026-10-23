import { smsConfig } from './env'

/** Sends an SMS through Twilio's Messages API. Never throws; returns whether it was accepted. */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const cfg = smsConfig()
  if (!cfg || !/^\+[1-9][0-9]{7,14}$/.test(to)) return false
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${cfg.sid}:${cfg.token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: cfg.from, Body: body.slice(0, 600) }),
    })
    if (!res.ok) console.error('[sms] Twilio', res.status, (await res.text()).slice(0, 300))
    return res.ok
  } catch (e) {
    console.error('[sms]', e)
    return false
  }
}
