import type { Metadata } from 'next'
import { SiteHeader, SiteFooter } from '@/components/marketing'
export const metadata: Metadata = { title: 'Privacy Policy' }
// TEMPLATE ONLY — have counsel review before launch (see docs/LAUNCH_CHECKLIST.md: call recording consent, data processing, retention).
export default function Page() {
  return (<><SiteHeader /><main className="prose mx-auto max-w-3xl px-5 py-16"><h1 className="text-3xl font-bold text-brand-950">Privacy Policy</h1><p className="mt-4 text-brand-800/80">Replace this placeholder with your reviewed Privacy Policy before accepting customers.</p></main><SiteFooter /></>)
}
