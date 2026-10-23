import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
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
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-24 pt-16 md:px-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h1 className="font-display text-5xl font-semibold leading-[1.1] tracking-[-0.01em] text-ink sm:text-7xl">Every call answered. Every emergency flagged.</h1>
            <p className="mt-5 max-w-xl text-lg text-muted">DialDesk answers your phone while you are under a sink, books the job into an arrival window, and texts you the details. Emergencies reach your on-call tech in seconds.</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/signup" className={btn.signal}>Start your 14-day free trial</Link>
              <Link href="#how" className="font-semibold text-primary underline underline-offset-4">See how it works</Link>
            </div>
            <p className="mt-3 text-sm text-muted">No card to start. Works with the number you already have.</p>
          </div>

          <aside aria-label="Example text message" className="rise relative rounded-xl border border-line bg-surface p-6 shadow-elevated before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l-xl before:bg-danger" style={{ ['--i' as string]: 1 }}>
            <p className="text-sm text-faint">Text to the owner, 9:42 PM</p>
            <p className="rise mt-2 font-display text-3xl text-danger" style={{ ['--i' as string]: 2 }}>Emergency: flooding</p>
            <dl className="mt-4 space-y-3">
              {[['Problem', 'Water coming through the kitchen ceiling'], ['Address', '14 Alder St, 60614'], ['Caller', 'Maria R., +1 773 555 0142'], ['Status', 'Transferred to the on-call tech']].map(([k, v], i) => (
                <div key={k} className="rise" style={{ ['--i' as string]: i + 3 }}><dt className="text-sm text-faint">{k}</dt><dd className="font-medium text-ink">{v}</dd></div>
              ))}
            </dl>
          </aside>
        </section>

        <section className="border-y border-line bg-surface py-24">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 md:px-6 lg:grid-cols-[5fr_7fr]">
            <div className="reveal">
              <h2 className="font-display text-4xl leading-[1.15] text-ink sm:text-5xl">Every call ends one of three ways</h2>
              <p className="mt-4 max-w-md text-muted">It never quotes prices, diagnoses problems or promises an exact arrival time.</p>
            </div>
            <dl className="divide-y divide-line border-y border-line">
              {paths.map(([t, d]) => (
                <div key={t} className="reveal py-6">
                  <dt className="font-display text-2xl text-ink">{t}</dt>
                  <dd className="mt-2 max-w-prose text-muted">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-4 py-24 md:px-6">
          <h2 className="reveal font-display text-4xl leading-[1.15] text-ink sm:text-5xl">Live in an afternoon</h2>
          <ol className="mt-12 divide-y divide-line border-y border-line">
            {steps.map(([t, d], i) => (
              <li key={t} className="reveal grid gap-4 py-8 md:grid-cols-[6rem_1fr_1.4fr] md:items-baseline md:gap-8">
                <span className="font-display text-5xl leading-[1.1] tabular-nums text-primary">{i + 1}</span>
                <h3 className="font-display text-2xl text-ink">{t}</h3>
                <p className="max-w-prose text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="pricing" className="border-t border-line bg-surface py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <h2 className="reveal font-display text-4xl leading-[1.15] text-ink sm:text-5xl">One saved job pays for the year</h2>
            <p className="reveal mb-12 mt-4 max-w-prose text-muted">Flat monthly price with call minutes included. Cancel anytime.</p>
            <PricingGrid />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-24 md:px-6">
          <div className="grid gap-12 lg:grid-cols-[5fr_7fr]">
            <h2 className="reveal font-display text-4xl leading-[1.15] text-ink sm:text-5xl">Questions</h2>
            <div className="divide-y divide-line border-y border-line">
              {faqs.map(([q, a]) => (
                <details key={q} className="group">
                  <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-4 text-lg font-medium text-ink transition hover:text-primary">
                    {q}<ChevronDown className="chev h-5 w-5 shrink-0 text-faint" aria-hidden />
                  </summary>
                  <p className="max-w-prose pb-6 text-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-band py-16">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-8 px-4 md:px-6">
            <div><Wordmark light /><p className="mt-4 font-display text-4xl leading-[1.15] text-[#e8eef2] sm:text-5xl">Stop losing jobs to voicemail.</p></div>
            <Link href="/signup" className={btn.signal}>Start your free trial</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
