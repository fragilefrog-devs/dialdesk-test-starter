'use client'
import { useFormStatus } from 'react-dom'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

/** Submit button with a pending state. The spinner only appears after the action has been running a moment. */
export function SubmitButton({ children, className, pending: label = 'Saving', formAction }: { children: ReactNode; className: string; pending?: string; formAction?: ButtonHTMLAttributes<HTMLButtonElement>['formAction'] }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" formAction={formAction} className={className} disabled={pending} aria-busy={pending}>
      {pending && <svg className="spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>}
      {pending ? `${label}…` : children}
    </button>
  )
}
