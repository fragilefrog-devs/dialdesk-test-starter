'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { AudioLines, Headphones, Mic, MicOff, Phone, PhoneOff, RotateCcw } from 'lucide-react'
import { Waveform } from '@/components/LiveCall'
import { BrandMark } from '@/components/marketing'
import { btn } from './ui'

type Phase = 'idle' | 'connecting' | 'live' | 'ended' | 'error'
type Line = { role: 'agent' | 'caller'; text: string }
interface VapiLike {
  start: (assistantId: string) => Promise<unknown>
  stop: () => void
  setMuted: (m: boolean) => void
  on: (event: string, cb: (...args: never[]) => void) => void
}

const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

function readableForeground(hex: string) {
  const channels = hex.slice(1).match(/[0-9a-f]{2}/gi)?.map((channel) => {
    const value = parseInt(channel, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }) ?? [0, 0, 0]
  return (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) > 0.179 ? '#000000' : '#ffffff'
}

/** Voice call in the browser through the Vapi web SDK. Rendered inside the iframe that widget.js opens. */
export function EmbedVoice({ publicKey, assistantId, businessName, accent }: {
  publicKey: string
  assistantId: string
  businessName: string
  accent: string
}) {
  const vapi = useRef<VapiLike | null>(null)
  const callStartedAt = useRef<number | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [muted, setMuted] = useState(false)
  const [level, setLevel] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState('')
  const foreground = readableForeground(accent)
  const accentStyle = { backgroundColor: accent, color: foreground }

  useEffect(() => () => { try { vapi.current?.stop() } catch { /* Vapi may already have ended the call. */ } }, [])

  useEffect(() => {
    if (phase !== 'live') return
    const timer = window.setInterval(() => {
      if (callStartedAt.current !== null) {
        setSeconds(Math.floor((Date.now() - callStartedAt.current) / 1000))
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  const start = useCallback(async () => {
    setPhase('connecting')
    setError('')
    setLines([])
    setMuted(false)
    setSeconds(0)
    callStartedAt.current = null
    try {
      const { default: Vapi } = await import('@vapi-ai/web')
      const instance = new Vapi(publicKey) as unknown as VapiLike
      vapi.current = instance
      instance.on('call-start', (() => {
        callStartedAt.current = Date.now()
        setPhase('live')
      }) as never)
      instance.on('call-end', (() => {
        setPhase('ended')
        setSpeaking(false)
        setLevel(0)
      }) as never)
      instance.on('speech-start', (() => setSpeaking(true)) as never)
      instance.on('speech-end', (() => setSpeaking(false)) as never)
      instance.on('volume-level', ((volume: number) => setLevel(Math.round(Math.max(0, Math.min(1, volume)) * 10) / 10)) as never)
      instance.on('message', ((message: { type?: string; role?: string; transcript?: string; transcriptType?: string }) => {
        if (message.type === 'transcript' && message.transcriptType === 'final' && message.transcript) {
          setLines((current) => [
            ...current,
            { role: message.role === 'assistant' ? 'agent' as const : 'caller' as const, text: message.transcript as string },
          ].slice(-8))
        }
      }) as never)
      instance.on('error', (() => {
        setError('The call could not continue. Please try again.')
        setPhase('error')
        setSpeaking(false)
        setLevel(0)
      }) as never)
      await instance.start(assistantId)
    } catch (cause) {
      const denied = cause instanceof Error && /permission|denied|notallowed/i.test(`${cause.name} ${cause.message}`)
      setError(denied
        ? 'Microphone access is blocked. Allow it in your browser settings, then try again.'
        : 'Could not start the call. Please try again.')
      setPhase('error')
    }
  }, [publicKey, assistantId])

  const end = () => {
    try {
      vapi.current?.stop()
      setPhase('ended')
      setSpeaking(false)
      setLevel(0)
    } catch {
      setError('The call could not end cleanly. Close this window to finish the call.')
      setPhase('error')
    }
  }

  const toggleMute = () => {
    const nextMuted = !muted
    vapi.current?.setMuted(nextMuted)
    setMuted(nextMuted)
  }

  const status = phase === 'connecting'
    ? 'Connecting'
    : phase === 'live'
      ? speaking ? 'Assistant speaking' : muted ? 'Microphone muted' : 'Listening'
      : phase === 'ended'
        ? 'Call ended'
        : 'Ready to talk'

  return (
    <main className="flex min-h-[100dvh] flex-col bg-canvas p-4" style={{ '--widget-accent': accent } as CSSProperties}>
      <header className="flex items-center gap-3 border-b border-line pb-4">
        <BrandMark className="size-10 rounded-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-base font-bold leading-snug text-ink">{businessName}</h1>
          <p className="mt-0.5 text-xs text-muted">Voice assistant</p>
        </div>
        <span className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted sm:inline-flex">
          <span className="size-1.5 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
          AI receptionist
        </span>
      </header>

      <section className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center py-6 text-center">
        <div className="grid size-24 place-items-center rounded-full border bg-surface shadow-card" style={{ borderColor: `${accent}55` }}>
          {phase === 'live'
            ? <AudioLines className="size-9" style={{ color: accent }} aria-hidden />
            : <Headphones className="size-9" style={{ color: accent }} aria-hidden />}
        </div>
        <h2 className="mt-5 font-display text-xl font-bold text-ink">
          {phase === 'live' ? 'You’re connected' : phase === 'connecting' ? 'Connecting your call' : phase === 'ended' ? 'Thanks for calling' : 'How can we help?'}
        </h2>
        <p className="mt-1 text-sm text-muted" role="status">
          {phase === 'live' ? `${status} · ${formatDuration(seconds)}` : status}
        </p>
        {phase === 'live' && <Waveform bars={24} className="mt-5 h-8" color={accent} />}
        {phase === 'connecting' && <p className="mt-5 text-sm text-muted">Allow microphone access if your browser asks.</p>}

        {(phase === 'live' || phase === 'connecting') && (
          <div className="mt-6 w-full rounded-xl border border-line bg-surface p-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-muted">LIVE CAPTIONS</p>
              <span className="text-xs tabular-nums text-faint">{formatDuration(seconds)}</span>
            </div>
            <div aria-live="polite" aria-label="Live call captions" className="mt-3 flex max-h-40 flex-col gap-2 overflow-y-auto">
              {lines.length ? lines.map((line, index) => (
                <p key={`${index}-${line.role}`} className={`max-w-[90%] rounded-lg px-3 py-2 text-sm leading-relaxed ${line.role === 'agent' ? 'self-start bg-surface-2 text-ink' : 'self-end text-ink'}`} style={line.role === 'caller' ? { backgroundColor: `${accent}1a` } : undefined}>
                  <span className="sr-only">{line.role === 'agent' ? 'Assistant: ' : 'You: '}</span>{line.text}
                </p>
              )) : (
                <p className="py-3 text-center text-sm text-faint">Your conversation will appear here.</p>
              )}
            </div>
            <div role="meter" aria-label="Microphone audio level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full origin-left rounded-full transition-transform" style={{ backgroundColor: accent, transform: `scaleX(${phase === 'live' ? Math.max(0.04, level) : 0.04})` }} />
            </div>
          </div>
        )}
        {(phase === 'idle' || phase === 'ended' || phase === 'error') && (
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Speak with our AI receptionist to ask a question, schedule a visit, or leave a message.
          </p>
        )}
        {phase === 'error' && <p role="alert" className="mt-4 w-full rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-left text-sm text-danger">{error}</p>}
        {phase === 'ended' && <p role="status" className="sr-only">Call ended. Thanks for calling.</p>}
      </section>

      <footer className="mx-auto w-full max-w-sm border-t border-line pt-4">
        {(phase === 'idle' || phase === 'ended' || phase === 'error') ? (
          <>
            <button type="button" onClick={start} className={`${btn.primary} w-full`} style={{ ...accentStyle, fontSize: 20, fontWeight: 700 }}>
              {phase === 'idle' ? <Phone className="size-4" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
              {phase === 'idle' ? 'Start voice call' : 'Call again'}
            </button>
            <p className="mt-3 text-center text-xs text-faint">Your browser will ask to use your microphone.</p>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={toggleMute}
              disabled={phase !== 'live'}
              aria-pressed={muted}
              className={btn.secondary}
            >
              {muted ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button type="button" onClick={end} className={btn.danger}>
              <PhoneOff className="size-4" aria-hidden />
              End call
            </button>
          </div>
        )}
        <p className="mt-3 text-center text-[11px] leading-relaxed text-faint">AI assistant. Call may be recorded.</p>
      </footer>
    </main>
  )
}
