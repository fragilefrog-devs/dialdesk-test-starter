'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { filterNav } from '@/lib/nav'
import { NAV_ICONS } from '@/components/NavLink'

export function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const id = useId()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const items = filterNav(query)
  const active = Math.min(selected, items.length - 1)

  const open = useCallback(() => {
    setQuery('')
    setSelected(0)
    dialog.current?.showModal()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (dialog.current?.open) dialog.current.close()
        else open()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const navigate = (href: string) => {
    dialog.current?.close()
    router.push(href)
  }

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % (items.length || 1))
    } else if (event.key === 'Enter' && items[active]) {
      navigate(items[active].href)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Search pages"
        aria-keyshortcuts="Control+K Meta+K"
        className="flex min-h-11 min-w-11 items-center justify-center gap-3 rounded-lg px-3 text-sm text-muted transition hover:bg-surface-2 hover:text-ink md:w-full md:justify-start md:border md:border-control"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden md:inline">Search pages</span>
        <kbd className="ml-auto hidden text-xs text-faint md:inline">Ctrl K</kbd>
      </button>
      <dialog
        ref={dialog}
        aria-label="Search pages"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close()
        }}
        className="m-auto mt-[12vh] w-[min(32rem,calc(100%-2rem))] overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-elevated backdrop:bg-band/60"
      >
        <div className="page-enter">
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="h-4 w-4 shrink-0 text-faint" aria-hidden />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setSelected(0)
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Go to a page..."
              autoComplete="off"
              role="combobox"
              aria-expanded="true"
              aria-controls={`${id}-list`}
              aria-activedescendant={items[active] ? `${id}-${active}` : undefined}
              className="min-h-12 w-full bg-transparent text-base text-ink placeholder:text-faint focus:outline-none sm:text-sm"
            />
          </div>
          <ul id={`${id}-list`} role="listbox" aria-label="Pages" className="p-2">
            {items.map((item, index) => {
              const Icon = NAV_ICONS[item.icon]
              return (
                <li
                  key={item.href}
                  id={`${id}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onClick={() => navigate(item.href)}
                  onMouseMove={() => setSelected(index)}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${index === active ? 'bg-surface-2 text-ink' : 'text-muted'}`}
                >
                  {Icon && <Icon className={`h-4 w-4 shrink-0 ${index === active ? 'text-primary' : ''}`} aria-hidden />}
                  {item.label}
                  <span className="ml-auto text-xs font-normal text-faint">{item.group}</span>
                </li>
              )
            })}
          </ul>
          {!items.length && <p className="px-4 py-6 text-sm text-muted">No page matches &quot;{query}&quot;. Try Calls, Billing or Team.</p>}
        </div>
      </dialog>
    </>
  )
}
