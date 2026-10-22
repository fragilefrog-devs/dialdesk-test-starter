import { requireAdmin } from '@/lib/auth'
export const dynamic = 'force-dynamic'
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <div className="mx-auto max-w-6xl p-6 md:p-10">{children}</div>
}
