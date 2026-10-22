import Link from 'next/link'
import { btn } from '@/components/ui'
export default function NotFound() {
  return (<main className="grid min-h-screen place-items-center px-5 text-center"><div><h1 className="text-4xl font-bold text-brand-950">Page not found</h1><p className="mt-2 text-brand-800/70">That page doesn’t exist.</p><Link href="/" className={`${btn.primary} mt-6`}>Back home</Link></div></main>)
}
