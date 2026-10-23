import type { Metadata } from 'next'
import { SiteHeader, SiteFooter, PricingGrid } from '@/components/marketing'
export const metadata: Metadata = { title: 'Pricing' }
export default function Pricing() {
  return (<><SiteHeader /><main className="mx-auto max-w-6xl px-5 py-16"><h1 className="mb-8 text-center text-4xl font-extrabold text-ink">Pricing</h1><PricingGrid /></main><SiteFooter /></>)
}
