'use client'

import { useEffect, useState } from 'react'
import { PhoneCall } from 'lucide-react'

const callWindowStyle = {
  width: 'min(100%, 380px, calc(56.25dvh - 36px))',
  aspectRatio: '9 / 16',
}

export function PublicCallWindow({ src, businessName }: { src: string; businessName: string }) {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      const data = event.data
      if (
        event.origin === window.location.origin &&
        data !== null &&
        typeof data === 'object' &&
        'type' in data &&
        data.type === 'dialdesk:close'
      ) {
        setOpen(false)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  if (!open) {
    return (
      <div className="mx-auto grid place-items-center rounded-[15px] border border-line bg-surface p-5 text-center shadow-card" style={callWindowStyle}>
        <div className="max-w-[260px]">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2 text-primary">
            <PhoneCall className="size-6" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-lg font-bold text-ink">Call window closed</h2>
          <p className="mt-1 text-sm text-muted">Start a voice call with {businessName} whenever you’re ready.</p>
          <button type="button" onClick={() => setOpen(true)} className="mt-5 min-h-11 rounded-[10px] bg-primary px-5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover">
            Open call window
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative mx-auto overflow-hidden rounded-[15px] border border-line bg-canvas shadow-card" style={callWindowStyle}>
      <iframe
        title={`Voice call with ${businessName}`}
        src={src}
        allow="microphone"
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 size-full"
      />
    </div>
  )
}
