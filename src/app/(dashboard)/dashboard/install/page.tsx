import type { Metadata } from 'next'
import { requireOrg } from '@/lib/auth'
import { Card, PageHeader } from '@/components/ui'
export const metadata: Metadata = { title: 'Website widget' }

export default async function Install() {
  const { org } = await requireOrg()
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const snippet = `<script src="${base}/widget.js" data-slug="${org.slug}" async></script>`
  return (
    <>
      <PageHeader title="Website widget" sub="Let visitors talk to your receptionist from your site." />
      <Card className="space-y-4">
        <p className="text-sm text-brand-900">Paste this before <code>&lt;/body&gt;</code> on your website:</p>
        <pre className="overflow-x-auto rounded-lg bg-brand-950 p-4 text-sm text-brand-100"><code>{snippet}</code></pre>
        <p className="text-sm text-brand-800/70">Or share your hosted page: <a className="font-semibold text-brand-600 underline" href={`/sites/${org.slug}`} target="_blank" rel="noreferrer">{base}/sites/{org.slug}</a></p>
      </Card>
    </>
  )
}
