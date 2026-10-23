import Link from 'next/link'
import { LiveCall } from '@/components/LiveCall'
import { BellRing, ChevronDown, MessageSquareText, PhoneForwarded, Siren, SlidersHorizontal, Wrench } from 'lucide-react'
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

const pathIcons = [Siren, Wrench, MessageSquareText]
const stepIcons = [SlidersHorizontal, PhoneForwarded, BellRing]

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="marketing-hero relative overflow-hidden border-b border-line bg-canvas">
          <div className="relative mx-auto grid max-w-[1400px] items-center gap-12 px-4 pb-16 pt-12 md:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-16">
            <div className="relative">
              <p className="rise mb-5 inline-flex min-h-8 items-center rounded-lg border border-line bg-surface px-3 py-1 text-sm font-semibold text-primary" style={{ ['--i' as string]: 0 }}>
                AI receptionist for plumbing and HVAC
              </p>
              <h1 className="rise max-w-[660px] font-display text-4xl font-extrabold leading-[1.12] tracking-tight text-ink sm:text-[42px] xl:text-[48px]" style={{ ['--i' as string]: 1 }}>
                Every call answered.<span className="block text-primary">Every emergency flagged.</span>
              </h1>
              <p className="rise mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg" style={{ ['--i' as string]: 2 }}>DialDesk answers your phone while you are under a sink, books the job into an arrival window, and texts you the details. Emergencies reach your on-call tech in seconds.</p>
              <div className="rise mt-7 flex flex-wrap items-center gap-3" style={{ ['--i' as string]: 3 }}>
                <Link href="/signup" className={`${btn.primary} min-h-12 px-6`}>Start your 14-day free trial</Link>
                <Link href="#how" className={`${btn.secondary} px-5`}>See how it works</Link>
              </div>
              <div className="rise mt-7 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-5 text-sm" style={{ ['--i' as string]: 4 }}>
                <p><span className="font-display text-2xl font-bold text-primary">14 days</span><span className="ml-2 text-muted">free, no card</span></p>
                <p><span className="font-display text-2xl font-bold text-primary">3 outcomes</span><span className="ml-2 text-muted">for every call</span></p>
              </div>
            </div>

            <div className="marketing-hero__preview space-y-4">
              <LiveCall />
              <aside aria-label="Example emergency text message" className="rise glass relative rounded-xl border border-line p-6 shadow-elevated before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l-xl before:bg-danger" style={{ ['--i' as string]: 1 }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-muted">Example emergency alert</p>
                  <span className="rounded-lg bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">Urgent</span>
                </div>
                <p className="rise mt-3 font-display text-2xl font-bold text-ink" style={{ ['--i' as string]: 2 }}>Flooding reported</p>
                <dl className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2">
                  {[['Problem', 'Water coming through the kitchen ceiling'], ['Address', '14 Alder St, 60614'], ['Caller', 'Maria R., +1 773 555 0142'], ['Status', 'On-call technician alerted']].map(([key, value], index) => (
                    <div key={key} className="rise" style={{ ['--i' as string]: index + 3 }}><dt className="text-xs font-medium text-faint">{key}</dt><dd className="mt-0.5 text-sm font-medium text-ink">{value}</dd></div>
                  ))}
                </dl>
              </aside>
            </div>
          </div>
        </section>

        <section id="features" className="border-y border-line bg-surface py-20 sm:py-24">
          <div className="mx-auto max-w-[1400px] px-4 md:px-8">
            <h2 className="reveal max-w-2xl font-display text-3xl font-extrabold leading-[1.15] tracking-tight text-ink sm:text-4xl">Every call ends one of three ways</h2>
            <p className="reveal mt-3 max-w-md text-muted">It never quotes prices, diagnoses problems or promises an exact arrival time.</p>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {paths.map(([title, description], index) => {
                const Icon = pathIcons[index]
                return (
                  <div key={title} className={`reveal bento rounded-xl border border-line p-6 shadow-card sm:p-8 ${index === 0 ? 'bg-danger-soft' : index === 1 ? 'bg-canvas' : 'bg-surface-2 md:col-span-2 md:flex md:items-center md:gap-8'}`}>
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg ${index === 0 ? 'bg-surface text-danger' : 'bg-surface-2 text-primary'}`}><Icon className="h-6 w-6" aria-hidden /></span>
                    <div className={index === 2 ? 'mt-5 md:mt-0' : 'mt-5'}>
                      <h3 className="font-display text-2xl text-ink">{title}</h3>
                      <p className="mt-2 max-w-prose text-muted">{description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-[1400px] px-4 py-20 md:px-8 sm:py-24">
          <h2 className="reveal font-display text-3xl font-extrabold leading-[1.15] tracking-tight text-ink sm:text-4xl">Live in an afternoon</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map(([title, description], index) => {
              const Icon = stepIcons[index]
              return (
                <li key={title} className="reveal bento rounded-xl border border-line bg-surface p-6 shadow-card">
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-lg bg-surface-2 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
                    <span aria-hidden className="text-gradient font-display text-5xl leading-none tabular-nums">{index + 1}</span>
                  </div>
                  <h3 className="mt-6 font-display text-2xl text-ink"><span className="sr-only">Step {index + 1}: </span>{title}</h3>
                  <p className="mt-2 text-muted">{description}</p>
                </li>
              )
            })}
          </ol>
        </section>

        <section id="pricing" className="border-t border-line bg-surface py-20 sm:py-24">
          <div className="mx-auto max-w-[1400px] px-4 md:px-8">
            <h2 className="reveal font-display text-3xl font-extrabold leading-[1.15] tracking-tight text-ink sm:text-4xl">One saved job pays for the year</h2>
            <p className="reveal mb-12 mt-4 max-w-prose text-muted">Flat monthly price with call minutes included. Cancel anytime.</p>
            <PricingGrid />
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-4 py-20 md:px-8 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-[5fr_7fr]">
            <h2 className="reveal font-display text-3xl leading-[1.15] text-ink sm:text-5xl">Questions</h2>
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

        <section className="relative overflow-hidden bg-band py-16 sm:py-20">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-8 px-4 md:px-8">
            <div><Wordmark light /><p className="mt-4 max-w-xl font-display text-3xl font-extrabold leading-[1.15] tracking-tight text-band-fg sm:text-4xl">Stop losing jobs to voicemail.</p></div>
            <Link href="/signup" className={`${btn.signal} cta-glow`}>Start your free trial</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
