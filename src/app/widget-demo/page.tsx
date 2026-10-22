import Script from 'next/script'
import { SiteHeader } from '@/components/marketing'

// Point DEMO_SLUG at a real demo tenant you control (create one via signup).
export default function WidgetDemo() {
  const slug = process.env.DEMO_TENANT_SLUG
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-20 text-center">
        <h1 className="text-3xl font-bold text-brand-950">Talk to a live receptionist</h1>
        {slug ? (<><p className="mt-3 text-brand-800/80">Tap “Talk to us” in the corner and try booking an appointment.</p>
          <Script src="/widget.js" data-slug={slug} strategy="afterInteractive" /></>)
          : <p className="mt-3 text-brand-800/80">Demo unavailable — set <code>DEMO_TENANT_SLUG</code>.</p>}
      </main>
    </>
  )
}
