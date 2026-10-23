'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff, PhoneOff } from 'lucide-react'
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

/** Voice call in the browser through the Vapi web SDK. Rendered inside the iframe that widget.js opens. */
export function EmbedVoice({ publicKey, assistantId, businessName }: { publicKey: string; assistantId: string; businessName: string }) {
  const vapi = useRef<VapiLike | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [muted, setMuted] = useState(false)
  const [level, setLevel] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState('')

  useEffect(() => () => { try { vapi.current?.stop() } catch { /* already stopped */ } }, [])

  const start = useCallback(async () => {
    setPhase('connecting'); setError(''); setLines([]); setMuted(false)
    try {
      const { default: Vapi } = await import('@vapi-ai/web')
      const v = new Vapi(publicKey) as unknown as VapiLike
      vapi.current = v
      v.on('call-start', (() => setPhase('live')) as never)
      v.on('call-end', (() => { setPhase('ended'); setSpeaking(false); setLevel(0) }) as never)
      v.on('speech-start', (() => setSpeaking(true)) as never)
      v.on('speech-end', (() => setSpeaking(false)) as never)
      v.on('volume-level', ((vol: number) => setLevel(Math.round(Math.min(1, vol) * 10) / 10)) as never)
      v.on('message', ((m: { type?: string; role?: string; transcript?: string; transcriptType?: string }) => {
        if (m.type === 'transcript' && m.transcriptType === 'final' && m.transcript) {
          setLines((l) => [...l, { role: m.role === 'assistant' ? 'agent' as const : 'caller' as const, text: m.transcript as string }].slice(-6))
        }
      }) as never)
      v.on('error', (() => { setError('The call could not continue. Please try again.'); setPhase('error') }) as never)
      await v.start(assistantId)
    } catch (e) {
      const denied = e instanceof Error && /permission|denied|notallowed/i.test(`${e.name} ${e.message}`)
      setError(denied ? 'Microphone access is blocked. Allow it in your browser settings, then try again.' : 'Could not start the call. Please try again.')
      setPhase('error')
    }
  }, [publicKey, assistantId])

  const end = () => { try { vapi.current?.stop() } catch { /* ignore */ } setPhase('ended') }
  const toggleMute = () => { const m = !muted; vapi.current?.setMuted(m); setMuted(m) }

  return (
    <main className="flex min-h-[100dvh] flex-col gap-4 bg-canvas p-4">
      <header className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
        <BrandMark className="h-10 w-10 rounded-lg" />
        <div className="min-w-0">
          <h1 className="font-display text-lg font-bold leading-snug text-ink">{businessName}</h1>
          <p className="mt-0.5 text-xs font-medium text-primary">Voice assistant</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">Talk to our virtual assistant. It can book a visit or take a message. This is an AI, and the call may be recorded.</p>
        </div>
      </header>

      {(phase === 'idle' || phase === 'ended' || phase === 'error') && (
        <section className="mt-auto rounded-xl border border-line bg-surface p-4 shadow-card">
          <p className="mb-4 text-sm leading-relaxed text-muted">Have a question or need to schedule a service visit? Start a voice call and we’ll help with the next step.</p>
          {phase === 'ended' && <p role="status" className="text-sm font-medium text-ink">Call ended. Thanks for calling.</p>}
          {phase === 'error' && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
          <button onClick={start} className={`${btn.primary} w-full`}><Mic className="h-4 w-4" aria-hidden />{phase === 'idle' ? 'Start a conversation' : 'Start a new call'}</button>
          <p className="mt-3 text-center text-xs text-faint">Your browser will ask to use your microphone.</p>
        </section>
      )}

      {(phase === 'connecting' || phase === 'live') && (
        <>
          <section aria-label="Call status" className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-ink" role="status">{phase === 'connecting' ? 'Connecting...' : speaking ? 'Assistant is speaking' : muted ? 'You are muted' : 'Listening'}</p>
              {phase === 'live' && <Waveform bars={16} className="h-6" />}
            </div>
            <div role="meter" aria-label="Microphone audio level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full origin-left rounded-full bg-primary transition-transform" style={{ transform: `scaleX(${phase === 'live' ? Math.max(0.04, level) : 0.04})` }} />
            </div>
          </section>
          <ul aria-live="polite" aria-label="Live captions" className="flex-1 space-y-2 overflow-y-auto text-sm">
            {lines.map((l, i) => <li key={i}><span className="font-medium text-ink">{l.role === 'agent' ? 'Assistant' : 'You'}</span> <span className="text-muted">{l.text}</span></li>)}
          </ul>
          <div className="mt-auto grid grid-cols-2 gap-3">
            <button onClick={toggleMute} disabled={phase !== 'live'} aria-pressed={muted} className={btn.secondary}>{muted ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}{muted ? 'Unmute' : 'Mute'}</button>
            <button onClick={end} className={btn.danger}><PhoneOff className="mr-2 h-4 w-4" aria-hidden />End call</button>
          </div>
        </>
      )}
    </main>
  )
}
