import { Skeleton } from '@/components/ui'

/** Streams in while a dashboard page loads. Mirrors the real layout: header, four stats, a framed list. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-8 space-y-2"><Skeleton className="h-9 w-48" /><Skeleton className="h-4 w-72 max-w-full" /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 !rounded-xl" />)}</div>
      <Skeleton className="mb-4 mt-8 h-7 w-40" />
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center justify-between gap-6 p-6"><div className="space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-64 max-w-full" /></div><Skeleton className="h-4 w-24" /></div>)}
      </div>
    </div>
  )
}
