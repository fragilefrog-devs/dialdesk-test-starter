'use client'
import { useState } from 'react'
import { btn } from './ui'

async function go(path: string, body?: object) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
  const j = await r.json()
  if (!r.ok || !j.url) throw new Error(j.error ?? 'Something went wrong')
  window.location.href = j.url
}

export function CheckoutButton({ plan, label, primary }: { plan: string; label: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  return (
    <>
      <button disabled={busy} className={primary ? btn.primary : btn.secondary}
        onClick={async () => { setBusy(true); setErr(''); try { await go('/api/billing/checkout', { plan }) } catch (e) { setErr((e as Error).message); setBusy(false) } }}>
        {busy ? 'Redirecting…' : label}
      </button>
      {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
    </>
  )
}

export function PortalButton() {
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  return (
    <>
      <button disabled={busy} className={btn.secondary} onClick={async () => {
        setBusy(true)
        setErr('')
        try { await go('/api/billing/portal') }
        catch (error) {
          setErr(error instanceof Error ? error.message : 'Could not open billing management.')
          setBusy(false)
        }
      }}>{busy ? 'Opening…' : 'Manage billing & invoices'}</button>
      {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
    </>
  )
}
