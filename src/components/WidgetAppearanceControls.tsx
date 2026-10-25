'use client'

import { useEffect, useRef, useState } from 'react'
import { Headphones, Phone, Play, Square, X } from 'lucide-react'
import { Card, input, label } from '@/components/ui'
import { VoiceSynthesizer } from '@/lib/voice-synthesizer'

export function WidgetAppearanceControls({
  initialLabel,
  initialPosition,
  initialAccent,
  businessName,
  disabled = false,
}: {
  initialLabel: string
  initialPosition: 'left' | 'right'
  initialAccent: string
  businessName: string
  disabled?: boolean
}) {
  const [widgetLabel, setWidgetLabel] = useState(initialLabel)
  const [widgetPosition, setWidgetPosition] = useState(initialPosition)
  const [accent, setAccent] = useState(initialAccent)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const synthesizer = useRef<VoiceSynthesizer | null>(null)
  useEffect(() => {
    synthesizer.current = new VoiceSynthesizer()
    return () => synthesizer.current?.stop()
  }, [])
  const colorValue = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : initialAccent
  const channels = colorValue.slice(1).match(/[0-9a-f]{2}/gi)?.map((channel) => {
    const value = parseInt(channel, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }) ?? [0, 0, 0]
  const foreground = (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) > 0.179 ? '#000000' : '#ffffff'

  const playVoiceSample = () => {
    setSpeechError('')
    if (speaking) {
      synthesizer.current?.stop()
      setSpeaking(false)
      return
    }

    setSpeaking(true)
    synthesizer.current?.speak(
      `Hello, thanks for calling ${businessName}. How can I help you today?`,
      {
        onEnd: () => setSpeaking(false),
        onError: (message) => {
          setSpeaking(false)
          setSpeechError(message)
        },
      },
    )
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card className="!p-5">
        <div className="mb-4">
          <h2 className="font-display text-lg font-bold text-ink">Appearance</h2>
          <p className="mt-1 text-sm text-muted">Set the button label, position, and accent color.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="label" className={label}>Button label</label>
            <input
              id="label"
              name="label"
              type="text"
              maxLength={32}
              required
              disabled={disabled}
              value={widgetLabel}
              onChange={(event) => setWidgetLabel(event.target.value)}
              className={input}
            />
            <p className="mt-2 text-xs text-faint">Shown on the floating voice button.</p>
          </div>
          <div>
            <label htmlFor="position" className={label}>Button position</label>
            <select
              id="position"
              name="position"
              disabled={disabled}
              value={widgetPosition}
              onChange={(event) => setWidgetPosition(event.target.value === 'left' ? 'left' : 'right')}
              className={input}
            >
              <option value="right">Bottom right</option>
              <option value="left">Bottom left</option>
            </select>
          </div>
          <div>
            <label htmlFor="accent" className={label}>Accent color</label>
            <div className="flex items-center gap-2">
              <input
                id="accent-picker"
                type="color"
                disabled={disabled}
                value={colorValue}
                onChange={(event) => setAccent(event.target.value)}
                aria-label="Choose widget accent color"
                className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-control bg-surface p-1"
              />
              <input
                id="accent"
                name="accent"
                type="text"
                disabled={disabled}
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                maxLength={7}
                pattern="#[0-9a-fA-F]{6}"
                title="Enter a six-digit hex color, such as #6657e8."
                required
                className={input}
              />
            </div>
            <p className="mt-2 text-xs text-faint">Choose a color or enter a hex code.</p>
          </div>
        </div>
      </Card>

      <Card className="flex min-w-0 flex-col !p-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Live preview</h2>
          <p className="mt-1 text-sm text-muted">See how the widget will look on your website.</p>
        </div>
        <section aria-label="Widget live preview" className="mt-4 flex flex-1 flex-col">
          <div className="relative min-h-[360px] flex-1 overflow-hidden rounded-lg border border-line bg-canvas p-4 sm:p-5">
            <div className="flex items-center justify-between border-b border-line pb-3 text-xs font-medium text-muted">
              <span className="truncate">{businessName || 'Your website'}</span>
              <span className="shrink-0">Website preview</span>
            </div>
            <div className="mt-8 max-w-[15rem]">
              <p className="font-display text-lg font-bold leading-snug text-ink">How can we help?</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">Get help with a repair or schedule a service visit.</p>
            </div>

            {previewOpen ? (
              <div className="absolute bottom-4 left-4 right-4 overflow-hidden rounded-xl border border-line bg-surface shadow-elevated sm:bottom-5 sm:left-5 sm:right-5">
                <div className="flex items-center gap-3 border-b border-line p-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2" style={{ color: accent }}>
                    <Headphones className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{businessName}</span>
                    <span className="block text-xs text-muted">AI voice assistant</span>
                  </span>
                  <button type="button" aria-label="Close call preview" onClick={() => setPreviewOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="p-4">
                  <p className="text-sm font-semibold text-ink">Ready when you are</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">Start a voice call to ask a question or schedule service.</p>
                  <button
                    type="button"
                    onClick={playVoiceSample}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
                    style={{ backgroundColor: accent, color: foreground }}
                  >
                    {speaking ? <Square className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                    {speaking ? 'Stop voice sample' : 'Play voice sample'}
                  </button>
                  <p className="mt-2 text-center text-[11px] text-faint">Preview only. No call will start.</p>
                  {speechError && <p role="alert" className="mt-2 text-center text-xs text-danger">{speechError}</p>}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className={`absolute bottom-4 inline-flex min-h-11 max-w-[calc(100%-2rem)] items-center gap-2 truncate rounded-lg px-4 text-sm font-semibold shadow-card transition hover:brightness-95 active:translate-y-px sm:bottom-5 ${widgetPosition === 'left' ? 'left-4 sm:left-5' : 'right-4 sm:right-5'}`}
                style={{ backgroundColor: accent, color: foreground }}
              >
                <Phone className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{widgetLabel.trim() || 'Talk to us'}</span>
              </button>
            )}
          </div>
        </section>
      </Card>
    </div>
  )
}
