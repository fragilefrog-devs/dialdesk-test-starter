import Link from 'next/link'
import { SiteHeader, SiteFooter, PricingGrid, Wordmark } from '@/components/marketing'
import { btn } from '@/components/ui'

const paths = [
  ['Emergency', 'Gas smell, burst pipe, no heat in winter. It gives the safety instructions first, texts you at once, and transfers the caller to your on-call tech.'],
  ['Repair', 'Takes the address, checks it is inside your service area, offers two arrival windows, reads the details back, and books the job.'],
  ['Estimate or message', 'Installs and replacements get an estimate visit. Anything else becomes a text with the caller’s number and what they need.'],
]
const steps = [
  ['Tell it what you do', 'Enter your services, the postcodes you cover, your arrival windows and who gets the alerts. About ten minutes.'],
  ['Get a number and forward to it', 'Pick a local number. Forward unanswered and after-hours calls from your current line, or publish the new one.'],
  ['Wake up to booked jobs', 'Each call ends as a job, a message or an emergency alert, with a summary and a recording you can replay.'],
]
const faqs = [
  ['Will callers know it is an AI?', 'Yes. It says it is a virtual assistant, and the greeting tells callers when the call may be recorded.'],
  ['What happens with a gas leak or a carbon monoxide alarm?', 'It tells the caller to leave the building and call emergency services first, texts you, and offers a transfer. It never gives repair instructions for gas or electrical problems.'],
  ['Does it quote prices?', 'No. It says the technician explains the cost on site. It also never diagnoses a problem or promises an exact arrival time.'],
  ['Can I keep my current number?', 'Yes. Set call forwarding on your line to your DialDesk number for unanswered or after-hours calls.'],
  ['Where does it work?', 'Numbers are US area codes today, and it books in your own time zone.'],
]

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-14 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h1 className="font-display text-5xl font-bold leading-[1.02] text-brand-950 sm:text-7xl">Every call answered. Every emergency flagged.</h1>
            <p className="mt-5 max-w-xl text-lg text-brand-800/85">DialDesk answers your phone while you are under a sink, books the job into an arrival window, and texts you the details. Emergencies reach your on-call tech in seconds.</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/signup" className={btn.signal}>Start your 14-day free trial</Link>
              <Link href="#how" className="font-semibold text-brand-700 underline underline-offset-4">See how it works</Link>
            </div>
            <p className="mt-3 text-sm text-brand-800/70">No card to start. Works with the number you already have.</p>
          </div>

          <aside aria-label="Example text message" className="relative rounded-xl border border-brand-200 bg-white p-5 shadow-elevated before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:rounded-l-xl before:bg-[#b3261e]">
            <p className="text-sm text-brand-800/70">Text to the owner, 9:42 PM</p>
            <p className="mt-2 font-display text-2xl font-bold text-[#b3261e]">Emergency: flooding</p>
            <dl className="mt-3 space-y-2 text-[15px]">
              <div><dt className="text-brand-800/60">Problem</dt><dd className="font-medium">Water coming through the kitchen ceiling</dd></div>
              <div><dt className="text-brand-800/60">Address</dt><dd className="font-medium">14 Alder St, 60614</dd></div>
              <div><dt className="text-brand-800/60">Caller</dt><dd className="font-medium">Maria R., +1 773 555 0142</dd></div>
              <div><dt className="text-brand-800/60">Status</dt><dd className="font-medium">Transferred to the on-call tech</dd></div>
            </dl>
          </aside>
        </section>

        <section className="border-y border-brand-200/70 bg-white py-14">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="font-display text-4xl font-bold text-brand-950">Every call ends one of three ways</h2>
            <dl className="mt-6 divide-y divide-brand-200/70">
              {paths.map(([t, d]) => (
                <div key={t} className="grid gap-1 py-5 md:grid-cols-[14rem_1fr] md:gap-8">
                  <dt className="font-display text-2xl font-semibold text-brand-900">{t}</dt>
                  <dd className="max-w-2xl text-brand-800/85">{d}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 max-w-2xl font-medium text-brand-900">It never quotes prices, diagnoses problems or promises an exact arrival time.</p>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="font-display text-4xl font-bold text-brand-950">Live in an afternoon</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {steps.map(([t, d], i) => (
              <li key={t}>
                <span className="font-display text-5xl font-bold text-signal-500">{i + 1}</span>
                <h3 className="mt-1 text-2xl font-semibold text-brand-950">{t}</h3>
                <p className="mt-1 text-brand-800/85">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-5 pb-16">
          <h2 className="font-display text-4xl font-bold text-brand-950">One saved job pays for the year</h2>
          <p className="mb-8 mt-2 text-brand-800/80">Flat monthly price with call minutes included. Cancel anytime.</p>
          <PricingGrid />
        </section>

        <section className="mx-auto max-w-3xl px-5 pb-20">
          <h2 className="mb-6 font-display text-4xl font-bold text-brand-950">Questions</h2>
          <div className="space-y-3">
            {faqs.map(([q, a]) => (
              <details key={q} className="rounded-lg border border-brand-200/70 bg-white p-4 shadow-soft">
                <summary className="cursor-pointer text-lg font-semibold text-brand-950">{q}</summary>
                <p className="mt-2 text-brand-800/85">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-brand-950 py-14">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5">
            <div><Wordmark light /><p className="mt-3 font-display text-4xl font-bold text-white">Stop losing jobs to voicemail.</p></div>
            <Link href="/signup" className={btn.signal}>Start your free trial</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
