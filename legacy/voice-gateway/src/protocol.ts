/**
 * WebSocket protocol for the voice gateway.
 *
 * Task 07 owns the shared session config shape plus the wire-message types and
 * (de)serializers for both transports. Task 10 appends session state/event types to
 * this file; nothing here should need to change when it does.
 */

export type Channel = 'phone' | 'web'
export const PROTOCOL_VERSION = 1

export interface VoiceSessionConfig {
  callId: string
  orgId: string
  channel: Channel
  callSid: string
  greeting: string
  instructions: string
  token: string
  tokenExpiresAt: number // ms since epoch
}

/* -------------------------------------------------------------------------- */
/* Twilio Media Streams                                                        */
/* -------------------------------------------------------------------------- */

export interface TwilioMediaFormat {
  encoding?: string
  sampleRate?: number
  channels?: number
}

export interface TwilioStart {
  streamSid: string
  callSid?: string
  accountSid?: string
  tracks?: string[]
  customParameters?: Record<string, string>
  mediaFormat?: TwilioMediaFormat
}

export interface TwilioConnectedMessage {
  event: 'connected'
  protocol?: string
  version?: string
}

export interface TwilioStartMessage {
  event: 'start'
  sequenceNumber?: string
  start: TwilioStart
}

export interface TwilioMediaMessage {
  event: 'media'
  sequenceNumber?: string
  streamSid?: string
  media: { track?: string; chunk?: string; timestamp?: string; payload: string }
}

export interface TwilioMarkMessage {
  event: 'mark'
  sequenceNumber?: string
  streamSid?: string
  mark?: { name?: string }
}

export interface TwilioStopMessage {
  event: 'stop'
  sequenceNumber?: string
  streamSid?: string
  stop?: { accountSid?: string; callSid?: string }
}

export type TwilioInboundMessage =
  | TwilioConnectedMessage
  | TwilioStartMessage
  | TwilioMediaMessage
  | TwilioMarkMessage
  | TwilioStopMessage

export interface TwilioOutboundMediaMessage {
  event: 'media'
  streamSid: string
  media: { payload: string }
}

/** Barge-in on a Twilio call: discard queued outbound audio. */
export interface TwilioClearMessage {
  event: 'clear'
  streamSid: string
}

export type TwilioOutboundMessage = TwilioOutboundMediaMessage | TwilioClearMessage

/* -------------------------------------------------------------------------- */
/* Browser widget protocol v1                                                  */
/* -------------------------------------------------------------------------- */

export interface BrowserStartMessage {
  v?: number
  type: 'start'
  callId?: string
  token?: string
}

export interface BrowserAudioMessage {
  type: 'audio'
  pcm: string // base64, 16 kHz PCM16LE
}

export interface BrowserStopMessage {
  type: 'stop'
}

export type BrowserInboundMessage = BrowserStartMessage | BrowserAudioMessage | BrowserStopMessage

export interface BrowserReadyMessage {
  type: 'ready'
}

export interface BrowserTranscriptMessage {
  type: 'transcript'
  role: 'caller' | 'agent'
  text: string
  turnId: string
}

export interface BrowserSpeakingMessage {
  type: 'speaking'
  value: boolean
  turnId: string
}

export interface BrowserOutboundAudioMessage {
  type: 'audio'
  pcm: string
  sampleRate: number
  turnId: string
}

/** Barge-in acknowledged to the widget (server stops playback). */
export interface BrowserInterruptMessage {
  type: 'interrupt'
}

export interface BrowserErrorMessage {
  type: 'error'
  code: string
}

export interface BrowserClosedMessage {
  type: 'closed'
  code: number
  reason?: string
}

export type BrowserOutboundMessage =
  | BrowserReadyMessage
  | BrowserTranscriptMessage
  | BrowserSpeakingMessage
  | BrowserOutboundAudioMessage
  | BrowserInterruptMessage
  | BrowserErrorMessage
  | BrowserClosedMessage

/* -------------------------------------------------------------------------- */
/* Parsing / serialization                                                     */
/* -------------------------------------------------------------------------- */

export type ProtocolParseError =
  | 'invalid_json'
  | 'invalid_message'
  | 'unsupported_protocol_version'

export type ParseResult<T> =
  | { ok: true; message: T }
  | { ok: false; error: ProtocolParseError }

const TWILIO_EVENTS = new Set(['connected', 'start', 'media', 'mark', 'stop'])
const BROWSER_TYPES = new Set(['start', 'audio', 'stop'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function decode(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch {
    return { ok: false }
  }
}

/**
 * Parses a Twilio Media Streams frame. Malformed JSON or unknown events return
 * `invalid_message`; callers may safely ignore the error.
 */
export function parseTwilioMessage(raw: string): ParseResult<TwilioInboundMessage> {
  const decoded = decode(raw)
  if (!decoded.ok) return { ok: false, error: 'invalid_json' }
  const value = decoded.value
  if (!isRecord(value) || typeof value.event !== 'string') {
    return { ok: false, error: 'invalid_message' }
  }
  if (!TWILIO_EVENTS.has(value.event)) return { ok: false, error: 'invalid_message' }

  if (value.event === 'start') {
    const start = value.start
    if (!isRecord(start) || !nonEmptyString(start.streamSid)) {
      return { ok: false, error: 'invalid_message' }
    }
  }

  if (value.event === 'media') {
    const media = value.media
    if (!isRecord(media) || typeof media.payload !== 'string') {
      return { ok: false, error: 'invalid_message' }
    }
  }

  return { ok: true, message: value as unknown as TwilioInboundMessage }
}

/**
 * Parses a browser widget frame. `start` must declare `v: 1`; missing or mismatched
 * versions are reported as `unsupported_protocol_version` so the transport can close
 * with the right error.
 */
export function parseBrowserMessage(raw: string): ParseResult<BrowserInboundMessage> {
  const decoded = decode(raw)
  if (!decoded.ok) return { ok: false, error: 'invalid_json' }
  const value = decoded.value
  if (!isRecord(value) || typeof value.type !== 'string') {
    return { ok: false, error: 'invalid_message' }
  }
  if (!BROWSER_TYPES.has(value.type)) return { ok: false, error: 'invalid_message' }

  if (value.type === 'start' && value.v !== PROTOCOL_VERSION) {
    return { ok: false, error: 'unsupported_protocol_version' }
  }

  if (value.type === 'audio' && typeof value.pcm !== 'string') {
    return { ok: false, error: 'invalid_message' }
  }

  return { ok: true, message: value as unknown as BrowserInboundMessage }
}

function serialize(message: unknown): string {
  return JSON.stringify(message)
}

/** Serializes one outbound Twilio `media` frame. */
export function serializeTwilioMedia(streamSid: string, payloadBase64: string): string {
  const message: TwilioOutboundMediaMessage = { event: 'media', streamSid, media: { payload: payloadBase64 } }
  return serialize(message)
}

/** Serializes the Twilio barge-in `clear` frame. */
export function serializeTwilioClear(streamSid: string): string {
  const message: TwilioClearMessage = { event: 'clear', streamSid }
  return serialize(message)
}

/** Serializes any outbound browser frame. */
export function serializeBrowserMessage(message: BrowserOutboundMessage): string {
  return serialize(message)
}
