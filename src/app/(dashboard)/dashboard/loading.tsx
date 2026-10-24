import { Skeleton } from '@/components/ui'

/** Streams in while a dashboard page loads. Mirrors the metrics and two-column activity layout. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-8 space-y-2"><Skeleton className="h-9 w-48" /><Skeleton className="h-4 w-72 max-w-full" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 !rounded-xl" />)}</div>
      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.8fr)]">
        <div>
          <div className="mb-3 space-y-2"><Skeleton className="h-6 w-36" /><Skeleton className="h-4 w-64 max-w-full" /></div>
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center justify-between gap-6 p-4"><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-64 max-w-full" /></div><Skeleton className="h-4 w-24 shrink-0" /></div>)}
          </div>
        </div>
        <Skeleton className="h-80 !rounded-xl" />
      </div>
    </div>
  )
}
