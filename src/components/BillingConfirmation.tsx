'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Notice } from '@/components/ui'

type ConfirmationState = 'checking' | 'pending' | 'synced' | 'error'

export function BillingConfirmation({ checkoutSessionId }: { checkoutSessionId?: string }) {
  const router = useRouter()
  const [state, setState] = useState<ConfirmationState>('checking')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const confirm = async (tries: number) => {
      setState('checking')
      setError('')
      try {
        const response = await fetch('/api/billing/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(checkoutSessionId ? { checkoutSessionId } : {}),
          cache: 'no-store',
        })
        const result = await response.json() as { status?: string; error?: string; provisioningPending?: boolean }
        if (!response.ok && response.status !== 202) {
          if (response.status >= 500 && tries < 4) {
            timer = setTimeout(() => { void confirm(tries + 1) }, 1500)
            return
          }
          throw new Error(result.error ?? 'Could not refresh your plan status.')
        }

        if (result.status === 'synced') {
          if (stopped) return
          setState('synced')
          if (result.provisioningPending) setError('Your plan is active. Some receptionist settings are still syncing.')
          router.refresh()
          return
        }

        if (tries >= 4) {
          if (!stopped) setState('pending')
          return
        }
        timer = setTimeout(() => { void confirm(tries + 1) }, 1500)
      } catch (cause) {
        if (stopped) return
        if (tries < 4) {
          timer = setTimeout(() => { void confirm(tries + 1) }, 1500)
          return
        }
        setError(cause instanceof Error ? cause.message : 'Could not refresh your plan status.')
        setState('error')
      }
    }

    void confirm(0)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [attempt, checkoutSessionId, router])

  if (state === 'synced') {
    return <Notice kind={error ? 'error' : 'success'}>{error || 'Your plan is active.'}</Notice>
  }
  if (state === 'pending') {
    return <div className="mb-4">
      <Notice kind="success">Payment received. Subscription activation is still processing. Your payment is safe.</Notice>
      <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-2 text-sm font-semibold text-primary underline underline-offset-2">
        Check plan status again
      </button>
    </div>
  }
  if (state === 'error') {
    return (
      <div className="mb-4">
        <Notice kind="error">{error}</Notice>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-2 text-sm font-semibold text-primary underline underline-offset-2">
          Retry plan confirmation
        </button>
      </div>
    )
  }
  return <Notice kind="success">Confirming your payment and updating the workspace plan…</Notice>
}
