'use client'
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { btn } from './ui'

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" className={btn.secondary} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000) } catch { /* clipboard blocked */ }
    }}>
      {done ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      <span role="status">{done ? 'Copied' : 'Copy code'}</span>
    </button>
  )
}
