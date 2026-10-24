import { Skeleton } from '@/components/ui'

export default function WorkspaceSettingsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading workspace settings">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Skeleton className="h-72 !rounded-xl" />
        <div className="grid gap-5">
          <Skeleton className="h-64 !rounded-xl" />
          <Skeleton className="h-52 !rounded-xl" />
        </div>
      </div>
    </div>
  )
}
