'use client'

import { useEffect, useRef } from 'react'

const NUMBER = /\d[\d,]*(?:\.\d+)?/g

export function CountUp({ value }: { value: string | number }) {
  const text = String(value)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const startedAt = performance.now()
    let frame = 0
    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / 700, 1)
      const eased = 1 - (1 - progress) ** 3
      element.textContent = text.replace(NUMBER, (match) => {
        const decimals = match.split('.')[1]?.length ?? 0
        return (parseFloat(match.replace(/,/g, '')) * eased).toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
          useGrouping: match.includes(','),
        })
      })
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      element.textContent = text
    }
  }, [text])

  return <span ref={ref}>{text}</span>
}
