import type { Metadata } from 'next'
import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { appEnv } from '@/lib/env'
import { rotateWidgetToken, saveWidget } from '../actions'
import { CopyButton } from '@/components/CopyButton'
import { SubmitButton } from '@/components/SubmitButton'
import { btn, Card, input, label, Notice, PageHeader } from '@/components/ui'
export const metadata: Metadata = { title: 'Website widget' }

export default async function Install({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams
  const { supabase, org, role } = await requireOrg()
  const { data: a, error: loadError } = await supabase.from('agents').select('vapi_assistant_id, widget_enabled, widget_domains, widget_token').eq('org_id', org.id).order('created_at').limit(1).maybeSingle()
  if (loadError) console.error('Website widget page: could not load widget settings', loadError)

  if (loadError || !a) {
    return (
      <>
        <PageHeader title="Website widget" sub="Let visitors talk to your receptionist from your website, with no phone call. It uses the same settings, booking and emergency rules." />
        {loadError
          ? <Notice kind="error">We could not load your widget settings. <Link href="/dashboard/install" className="font-semibold underline underline-offset-4">Try again</Link>.</Notice>
          : <Notice kind="error">Your receptionist is not set up yet. <Link href="/dashboard/agent" className="font-semibold underline underline-offset-4">Set up your receptionist</Link>, then come back to add the website widget.</Notice>}
      </>
    )
  }

  const app = appEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  const tokenMissing = !a.widget_token
  const snippet = tokenMissing ? '' : `<script src="${app}/widget.js" data-token="${a.widget_token}" async></script>`
  const ro = role === 'member'
  const keyMissing = !process.env.VAPI_PUBLIC_KEY
  const notReady = !a.vapi_assistant_id

  return (
    <>
      <PageHeader title="Website widget" sub="Let visitors talk to your receptionist from your website, with no phone call. It uses the same settings, booking and emergency rules." />
      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="success">{ok}</Notice>}
      {keyMissing && <Notice kind="error">The widget is not available yet: the server needs a Vapi public key (VAPI_PUBLIC_KEY). See DEPLOYMENT.md.</Notice>}
      {notReady && <Notice kind="error">Save your receptionist settings first so the voice assistant exists.</Notice>}

      <form action={saveWidget} className="space-y-6">
        <fieldset disabled={ro} className="space-y-6">
          <Card className="space-y-5">
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="enabled" defaultChecked={a.widget_enabled} className="mt-1" /><span><span className="font-medium text-ink">Turn on the website widget</span><br /><span className="text-muted">Visitors hear that it is an AI assistant and that calls may be recorded. Widget calls use your plan minutes.</span></span></label>
            <div>
              <label htmlFor="domains" className={label}>Websites allowed to show the widget</label>
              <textarea id="domains" name="domains" rows={3} defaultValue={((a.widget_domains as string[] | null) ?? []).join('\n')} className={input} placeholder={'alderstreetplumbing.com'} />
              <p className="mt-2 text-xs text-faint">One domain per line. A domain also covers its subdomains. On any other site the widget stays hidden and the assistant is never loaded.</p>
            </div>
          </Card>
        </fieldset>
        {!ro && <SubmitButton className={btn.primary}>Save widget settings</SubmitButton>}
      </form>

      <Card className="mt-8 space-y-4">
        <h2 className="font-display text-2xl text-ink">Add it to your site</h2>
        {tokenMissing ? (
          <Notice kind="error">{ro ? 'This widget does not have a code yet. An owner or admin needs to create one before the snippet appears.' : 'This widget does not have a code yet. Create a new code below to get the snippet for your site.'}</Notice>
        ) : (
          <>
            <p className="max-w-prose text-sm text-muted">Paste this just before the closing body tag on every page where you want the button. It adds a “Talk to us” button in the corner.</p>
            <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-4 text-sm text-ink"><code>{snippet}</code></pre>
          </>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {!tokenMissing && <CopyButton text={snippet} />}
          {!ro && <form action={rotateWidgetToken}><SubmitButton className={btn.secondary} pending="Creating">Create a new code</SubmitButton></form>}
        </div>
        <p className="text-xs text-faint">Optional attributes: <code>data-label</code> changes the button text and <code>{`data-position="left"`}</code> moves it to the left corner. Creating a new code stops the old snippet from working.</p>
      </Card>

      {a.widget_enabled && !keyMissing && !notReady && !tokenMissing && (
        <Card className="mt-8">
          <h2 className="font-display text-2xl text-ink">Try it</h2>
          <p className="mb-4 mt-2 max-w-prose text-sm text-muted">This is exactly what your visitors see. A test call counts toward your minutes.</p>
          <iframe title="Widget preview" src={`/embed/${a.widget_token}`} allow="microphone" referrerPolicy="strict-origin-when-cross-origin" className="h-[480px] w-full max-w-sm rounded-xl border border-line" />
        </Card>
      )}
    </>
  )
}
