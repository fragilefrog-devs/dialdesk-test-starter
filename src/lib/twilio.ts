import { createHmac, timingSafeEqual } from 'node:crypto'
import { appEnv, twilioEnv } from './env'

/** Validates X-Twilio-Signature. `url` must be the exact public URL Twilio called. */
export function validateTwilioSignature(url: string, params: Record<string, string>, signature: string | null) {
  if (!signature) return false
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
  const expected = createHmac('sha1', twilioEnv().TWILIO_AUTH_TOKEN).update(data).digest('base64')
  const a = Buffer.from(expected), b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

const base = () => `https://api.twilio.com/2010-04-01/Accounts/${twilioEnv().TWILIO_ACCOUNT_SID}`
const auth = () => 'Basic ' + Buffer.from(`${twilioEnv().TWILIO_ACCOUNT_SID}:${twilioEnv().TWILIO_AUTH_TOKEN}`).toString('base64')

async function twilio(path: string, init?: RequestInit) {
  const res = await fetch(base() + path, { ...init, headers: { Authorization: auth(), 'Content-Type': 'application/x-www-form-urlencoded', ...init?.headers } })
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function searchNumbers(country: string, areaCode?: string) {
  const q = new URLSearchParams({ VoiceEnabled: 'true', PageSize: '10' })
  if (areaCode) q.set('AreaCode', areaCode)
  const data = await twilio(`/AvailablePhoneNumbers/${encodeURIComponent(country)}/Local.json?${q}`)
  return (data.available_phone_numbers ?? []) as { phone_number: string; friendly_name: string }[]
}

export async function buyNumber(e164: string) {
  const appUrl = appEnv().NEXT_PUBLIC_APP_URL
  const body = new URLSearchParams({
    PhoneNumber: e164,
    VoiceUrl: `${appUrl}/api/webhooks/twilio/voice`, VoiceMethod: 'POST',
    StatusCallback: `${appUrl}/api/webhooks/twilio/status`, StatusCallbackMethod: 'POST',
  })
  return (await twilio('/IncomingPhoneNumbers.json', { method: 'POST', body })) as { sid: string; phone_number: string }
}

export async function releaseNumber(sid: string) {
  await fetch(`${base()}/IncomingPhoneNumbers/${sid}.json`, { method: 'DELETE', headers: { Authorization: auth() } })
}

export async function transferCall(callSid: string, toE164: string) {
  const twiml = `<Response><Dial>${toE164.replace(/[^+0-9]/g, '')}</Dial></Response>`
  return twilio(`/Calls/${callSid}.json`, { method: 'POST', body: new URLSearchParams({ Twiml: twiml }) })
}
