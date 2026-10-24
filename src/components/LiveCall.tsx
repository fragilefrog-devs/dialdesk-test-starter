'use client'

import { useEffect, useState } from 'react'

const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export function Waveform({ bars = 24, className = '', color }: { bars?: number; className?: string; color?: string }) {
  return (
    <div aria-hidden className={`wave flex h-8 items-center gap-1 text-primary ${className}`} style={color ? { color } : undefined}>
      {Array.from({ length: bars }, (_, index) => (
        <i
          key={index}
          style={{
            ['--s' as string]: `${0.55 + (index % 5) * 0.13}s`,
            ['--d' as string]: `${(index % 7) * -0.12}s`,
          }}
        />
      ))}
    </div>
  )
}

export function LiveCall() {
  const [seconds, setSeconds] = useState(42)
  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section aria-label="Example of a call in progress" className="rise flex items-center gap-4 rounded-xl border border-line bg-surface p-4 shadow-card" style={{ ['--i' as string]: 0 }}>
      <span aria-hidden className="live-dot shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">Live call<span className="sr-only"> in progress</span></p>
        <p className="truncate text-sm text-faint">Maria R., kitchen ceiling leak <span aria-hidden>· {formatDuration(seconds)}</span></p>
      </div>
      <Waveform bars={20} className="hidden sm:flex" />
    </section>
  )
}
