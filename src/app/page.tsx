import Link from 'next/link'
import { SiteHeader, SiteFooter, PricingGrid } from '@/components/marketing'
import { btn } from '@/components/ui'

const verticals = [
  ['🏥', 'Clinics & dental', 'Book visits, answer insurance and hours questions, triage urgent calls to your staff.'],
  ['🏠', 'Real estate', 'Qualify buyers, schedule viewings, and hand hot leads to an agent instantly.'],
  ['🔧', 'Home services', 'Capture job details and book estimates while your team is on the roof.'],
  ['💇', 'Salons & studios', 'Fill the calendar after hours and cut no-show gaps with instant rebooking.'],
]
const steps = [
  ['Tell us about your business', 'Add services, hours and FAQs. The receptionist learns them in minutes.'],
  ['Get a phone number', 'Pick a local number or forward your existing line. Add the website voice widget too.'],
  ['Watch the calls turn into bookings', 'Every call is transcribed, summarized, and booked or captured as a lead.'],
]
const faqs = [
  ['Will callers know it is an AI?', 'Yes. The receptionist introduces itself as an AI assistant, and you control the greeting.'],
  ['What if it cannot answer something?', 'It says so, captures the caller’s details as a lead, or transfers to a human line you set.'],
  ['Can I keep my current number?', 'Yes — forward calls (always, after hours, or when busy) to your receptionist number.'],
  ['What happens to call data?', 'Each business’s data is isolated at the database level. You can export or delete it any time.'],
]

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-20 text-center">
          <p className="mx-auto mb-4 w-fit rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800">Built for clinics, agencies and local businesses</p>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-brand-950 sm:text-6xl">Every call answered. Every appointment booked.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-brand-800/80">An AI receptionist that picks up in under a second, 24/7 — books appointments, captures leads and sends you the summary. Live in ten minutes.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className={btn.primary}>Start your 14-day free trial</Link>
            <Link href="/widget-demo" className={btn.secondary}>Hear a live demo</Link>
          </div>
          <p className="mt-3 text-xs text-brand-800/60">No credit card to start · Cancel anytime</p>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-center text-3xl font-bold text-brand-950">How it works</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {steps.map(([t, d], i) => (
              <div key={t} className="rounded-xl border border-brand-200/70 bg-white p-6 shadow-card">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 font-bold text-white">{i + 1}</span>
                <h3 className="mt-4 font-semibold text-brand-950">{t}</h3>
                <p className="mt-1 text-sm text-brand-800/75">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-brand-950 py-16 text-white">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-center text-3xl font-bold">Made for businesses that live on the phone</h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {verticals.map(([e, t, d]) => (
                <div key={t} className="rounded-xl border border-white/10 bg-white/5 p-5">
                  <p aria-hidden className="text-2xl">{e}</p><h3 className="mt-3 font-semibold">{t}</h3><p className="mt-1 text-sm text-white/70">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-center text-3xl font-bold text-brand-950">Simple pricing</h2>
          <p className="mb-8 mt-2 text-center text-brand-800/70">Cheaper than a part-time receptionist. Upgrade or cancel whenever.</p>
          <PricingGrid />
        </section>

        <section className="mx-auto max-w-3xl px-5 pb-20">
          <h2 className="mb-6 text-center text-3xl font-bold text-brand-950">Questions</h2>
          <div className="space-y-3">
            {faqs.map(([q, a]) => (
              <details key={q} className="group rounded-xl border border-brand-200/70 bg-white p-4 shadow-soft">
                <summary className="cursor-pointer font-semibold text-brand-950">{q}</summary>
                <p className="mt-2 text-sm text-brand-800/80">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
