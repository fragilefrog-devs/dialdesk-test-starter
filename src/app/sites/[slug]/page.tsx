import Script from 'next/script'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
const getOrg = async (slug: string) =>
  (await supabaseAdmin().from('organizations').select('name, slug').eq('slug', slug.toLowerCase()).maybeSingle()).data

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const org = await getOrg(slug)
  return { title: org ? `${org.name} — talk to our AI receptionist` : 'Not found' }
}

export default async function Site({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const org = await getOrg(slug)
  if (!org) notFound()
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-brand-50 to-white px-5 text-center">
      <div className="max-w-md">
        <h1 className="text-4xl font-extrabold text-brand-950">{org.name}</h1>
        <p className="mt-3 text-brand-800/80">Questions or want to book? Tap the button below and talk to our AI receptionist — available 24/7.</p>
        <p className="mt-6 text-xs text-brand-800/60">Voice chat uses your microphone. Conversations are transcribed and may be recorded.</p>
      </div>
      <Script src="/widget.js" data-slug={org.slug} strategy="afterInteractive" />
    </main>
  )
}
