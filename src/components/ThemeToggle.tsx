'use client'

import { useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

type Mode = 'system' | 'light' | 'dark'
const ORDER: Mode[] = ['system', 'light', 'dark']
const LABEL: Record<Mode, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const ICON = { system: Monitor, light: Sun, dark: Moon }

const subscribe = (callback: () => void) => {
  window.addEventListener('dd-theme', callback)
  return () => window.removeEventListener('dd-theme', callback)
}
const read = (): Mode => {
  const theme = document.documentElement.dataset.theme
  return theme === 'light' || theme === 'dark' ? theme : 'system'
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const mode = useSyncExternalStore(subscribe, read, (): Mode => 'system')
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
  const Icon = ICON[mode]

  const apply = () => {
    const root = document.documentElement
    try {
      if (next === 'system') localStorage.removeItem('dd-theme')
      else localStorage.setItem('dd-theme', next)
    } catch {
      // The selected theme still applies for this visit when storage is unavailable.
    }
    if (next === 'system') delete root.dataset.theme
    else root.dataset.theme = next
    window.dispatchEvent(new Event('dd-theme'))
  }

  return (
    <button
      type="button"
      onClick={apply}
      aria-label={`Theme: ${LABEL[mode]}. Switch to ${LABEL[next]}`}
      className={`flex min-h-11 min-w-11 items-center justify-center gap-3 rounded-lg px-3 text-sm text-muted transition hover:bg-surface-2 hover:text-ink ${compact ? '' : 'md:w-full md:justify-start'}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {!compact && <span className="hidden md:inline">Theme: {LABEL[mode]}</span>}
    </button>
  )
}
