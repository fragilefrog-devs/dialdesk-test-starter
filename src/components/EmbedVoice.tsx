'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { AudioLines, Mic, MicOff, Phone, PhoneOff, RotateCcw, X } from 'lucide-react'
import { BrandMark } from '@/components/marketing'
import { widgetCallErrorMessage } from '@/lib/widget-call-error'
import { btn } from './ui'

type Phase = 'idle' | 'connecting' | 'live' | 'ended' | 'error'
type Line = { role: 'agent' | 'caller'; text: string }
interface VapiLike {
  start: (assistantId: string) => Promise<unknown>
  stop: () => void
  setMuted: (m: boolean) => void
  on: (event: string, cb: (...args: never[]) => void) => void
}

const WAVE_BARS = 13
const compactButton: CSSProperties = { height: 38, fontSize: 13, borderRadius: 10 }

const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

function readableForeground(hex: string) {
  const channels = hex.slice(1).match(/[0-9a-f]{2}/gi)?.map((channel) => {
    const value = parseInt(channel, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }) ?? [0, 0, 0]
  return (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) > 0.179 ? '#000000' : '#ffffff'
}

/** Level-driven waveform shown inside the orb while the call is live. Flat when muted. */
function LevelWave({ level, seconds, flat, color }: { level: number; seconds: number; flat: boolean; color: string }) {
  return (
    <div className="flex h-16 items-center justify-center gap-[3px]" aria-hidden>
      {Array.from({ length: WAVE_BARS }, (_, index) => {
        const height = flat
          ? 3
          : 3 + Math.abs(Math.sin(index * 0.8 + seconds * 1.3 + level * 7)) * 60 * Math.max(0.18, level)
        return (
          <span
            key={index}
            className="block w-[3px] rounded-full transition-[height] duration-150"
            style={{ height, backgroundColor: color }}
          />
        )
      })}
    </div>
  )
}

/**
 * Voice call in the browser through the Vapi web SDK. Rendered inside the iframe that widget.js opens.
 * `onClose` lets the host dismiss the widget; by default it asks the parent page (widget.js) to close the iframe.
 */
export function EmbedVoice({ publicKey, assistantId, businessName, accent, onClose }: {
  publicKey: string
  assistantId: string
  businessName: string
  accent: string
  onClose?: () => void
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
      instance.on('error', ((cause: unknown) => {
        setError(widgetCallErrorMessage(cause))
        setPhase('error')
        setSpeaking(false)
        setLevel(0)
      }) as never)
      await instance.start(assistantId)
    } catch (cause) {
      setError(widgetCallErrorMessage(cause))
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

  const close = () => {
    try { vapi.current?.stop() } catch { /* Vapi may already have ended the call. */ }
    if (onClose) onClose()
    else window.parent?.postMessage({ type: 'dialdesk:close' }, '*')
  }

  const toggleMute = () => {
    const nextMuted = !muted
    vapi.current?.setMuted(nextMuted)
    setMuted(nextMuted)
  }

  const status = phase === 'connecting'
    ? 'Calling'
    : phase === 'live'
      ? speaking ? 'Assistant speaking' : muted ? 'Microphone muted' : 'Listening'
      : phase === 'ended'
        ? 'Call ended'
        : 'Ready to talk'

  const live = phase === 'live'
  const showCaptions = live || phase === 'connecting'
  const resting = phase === 'idle' || phase === 'ended' || phase === 'error'

  return (
    <main className="flex h-[100dvh] flex-col bg-canvas p-3" style={{ '--widget-accent': accent } as CSSProperties}>
      <header className="flex items-center gap-2.5 border-b border-line pb-2.5">
        <BrandMark className="size-8 rounded-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-sm font-bold leading-tight text-ink">{businessName}</h1>
          <p className="mt-px text-[11px] text-muted">Voice assistant</p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <section className="mx-auto flex min-h-0 w-full max-w-[380px] flex-1 flex-col items-center justify-center overflow-hidden py-2.5 text-center">
        <div
          className="grid size-[92px] shrink-0 place-items-center rounded-full border bg-surface shadow-card transition-transform duration-150"
          style={{ borderColor: `${accent}55`, transform: live ? `scale(${1 + level * 0.04})` : undefined }}
        >
          {live
            ? <LevelWave level={level} seconds={seconds} flat={muted} color={accent} />
            : <AudioLines className="size-[34px]" style={{ color: accent }} aria-hidden />}
        </div>
        <h2 className="mt-3 font-display text-[15px] font-bold text-ink">
          {live ? 'You’re connected' : phase === 'connecting' ? 'Connecting your call' : phase === 'ended' ? 'Thanks for calling' : 'How can we help?'}
        </h2>
        <p className="mt-0.5 text-[12.5px] tabular-nums text-muted" role="status">
          {live ? `${status} · ${formatDuration(seconds)}` : status}
        </p>
        {phase === 'connecting' && <p className="mt-2 text-[12.5px] text-muted">Allow microphone access if your browser asks.</p>}

        {showCaptions && (
          <div className="mt-3.5 flex min-h-0 w-full flex-1 flex-col text-left">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold tracking-[0.06em] text-muted">LIVE CAPTIONS</p>
              <span className="text-[11px] tabular-nums text-faint">{formatDuration(seconds)}</span>
            </div>
            <div aria-live="polite" aria-label="Live call captions" className="mt-2 flex min-h-40 flex-1 flex-col justify-end gap-1.5 overflow-hidden px-0.5">
              {lines.length ? lines.map((line, index) => (
                <p key={`${index}-${line.role}`} className={`max-w-[90%] rounded-[10px] px-2.5 py-1.5 text-[12.5px] leading-snug ${line.role === 'agent' ? 'self-start bg-surface-2 text-ink' : 'self-end text-ink'}`} style={line.role === 'caller' ? { backgroundColor: `${accent}1a` } : undefined}>
                  <span className="sr-only">{line.role === 'agent' ? 'Assistant: ' : 'You: '}</span>{line.text}
                </p>
              )) : (
                <p className="mb-12 self-center text-center text-[12.5px] text-faint">Your conversation will appear here.</p>
              )}
            </div>
            <div role="meter" aria-label="Microphone audio level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} className="mt-2 h-[3px] overflow-hidden rounded-full bg-surface-2">
              <div className="h-full origin-left rounded-full transition-transform" style={{ backgroundColor: accent, transform: `scaleX(${live ? Math.max(0.04, level) : 0.04})` }} />
            </div>
          </div>
        )}
        {resting && (
          <p className="mt-2 max-w-[260px] text-[12.5px] leading-normal text-muted">
            Speak with our AI receptionist to ask a question, schedule a visit, or leave a message.
          </p>
        )}
        {phase === 'error' && <p role="alert" className="mt-2.5 w-full rounded-lg border border-danger/30 bg-danger-soft px-2.5 py-2 text-left text-xs text-danger">{error}</p>}
        {phase === 'ended' && <p role="status" className="sr-only">Call ended. Thanks for calling.</p>}
      </section>

      <footer className="mx-auto w-full max-w-[380px] border-t border-line pt-2.5">
        {resting ? (
          <button type="button" onClick={start} className={`${btn.primary} w-full`} style={{ ...accentStyle, height: 42, fontSize: 15, fontWeight: 700, borderRadius: 10 }}>
            {phase === 'idle' ? <Phone className="size-[15px]" aria-hidden /> : <RotateCcw className="size-[15px]" aria-hidden />}
            {phase === 'idle' ? 'Start voice call' : 'Call again'}
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={toggleMute}
              disabled={!live}
              aria-pressed={muted}
              className={btn.secondary}
              style={compactButton}
            >
              {muted ? <MicOff className="size-[15px]" aria-hidden /> : <Mic className="size-[15px]" aria-hidden />}
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button type="button" onClick={end} className={btn.danger} style={compactButton}>
              <PhoneOff className="size-[15px]" aria-hidden />
              End call
            </button>
          </div>
        )}
        <p className="mt-2 text-center text-[10px] leading-relaxed text-faint">Powered By DialDesk</p>
      </footer>
    </main>
  )
}