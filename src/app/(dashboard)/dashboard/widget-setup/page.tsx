import type { Metadata } from 'next'
import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { appEnv } from '@/lib/env'
import { rotateWidgetToken, saveWidget } from '../actions'
import { CopyButton } from '@/components/CopyButton'
import { SubmitButton } from '@/components/SubmitButton'
import { WidgetAppearanceControls } from '@/components/WidgetAppearanceControls'
import { btn, Card, input, label, Notice, PageHeader } from '@/components/ui'
export const metadata: Metadata = { title: 'Widget setup' }

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default async function WidgetSetup({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams
  const { supabase, org, role } = await requireOrg()
  const { data: a, error: loadError } = await supabase.from('agents').select('vapi_assistant_id, widget_enabled, widget_domains, widget_token, widget_label, widget_position, widget_accent').eq('org_id', org.id).order('created_at').limit(1).maybeSingle()
  if (loadError) console.error('Widget setup page: could not load widget settings', loadError)

  if (loadError || !a) {
    return (
      <>
        <PageHeader title="Widget setup" sub="Add a voice assistant to your website and control how visitors open it." />
        {loadError
          ? <Notice kind="error">We could not load your widget settings. <Link href="/dashboard/widget-setup" className="font-semibold underline underline-offset-4">Try again</Link>.</Notice>
          : <Notice kind="error">Your receptionist is not set up yet. <Link href="/dashboard/agent" className="font-semibold underline underline-offset-4">Set up your receptionist</Link>, then come back to add the website widget.</Notice>}
      </>
    )
  }

  const app = appEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  const tokenMissing = !a.widget_token
  const widgetLabel = a.widget_label || 'Talk to us'
  const widgetPosition = a.widget_position === 'left' ? 'left' : 'right'
  const widgetAccent = /^#[0-9a-fA-F]{6}$/.test(a.widget_accent) ? a.widget_accent : '#6657e8'
  const snippet = tokenMissing ? '' : `<script src="${app}/widget.js" data-token="${a.widget_token}" data-label="${escapeAttribute(widgetLabel)}" data-position="${widgetPosition}" data-accent="${widgetAccent}" async></script>`
  const ro = role === 'member'
  const keyMissing = !process.env.VAPI_PUBLIC_KEY
  const notReady = !a.vapi_assistant_id

  return (
    <>
      <PageHeader title="Widget setup" sub="Add a voice assistant to your website and control how visitors open it." />
      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="success">{ok}</Notice>}
      {keyMissing && <Notice kind="error">The widget is not available yet: the server needs a Vapi public key (VAPI_PUBLIC_KEY). See DEPLOYMENT.md.</Notice>}
      {notReady && <Notice kind="error">Save your receptionist settings first so the voice assistant exists.</Notice>}

      <form action={saveWidget} className="space-y-6">
        <Card className="space-y-5">
          <fieldset disabled={ro} className="flex flex-col gap-5">
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="enabled" defaultChecked={a.widget_enabled} className="mt-1" /><span><span className="font-medium text-ink">Turn on the website widget</span><br /><span className="text-muted">Visitors hear that it is an AI assistant and that calls may be recorded. Widget calls use your plan minutes.</span></span></label>
            <div>
              <label htmlFor="domains" className={label}>Websites allowed to show the widget</label>
              <textarea id="domains" name="domains" rows={3} defaultValue={((a.widget_domains as string[] | null) ?? []).join('\n')} className={input} placeholder="alderstreetplumbing.com" />
              <p className="mt-2 text-xs text-faint">One domain per line. A domain also covers its subdomains. On any other site the widget stays hidden and the assistant is never loaded.</p>
            </div>
          </fieldset>
        </Card>
        <Card className="!p-5">
          <div className="mb-5">
            <h2 className="font-display text-xl font-bold text-ink">Appearance</h2>
            <p className="mt-1 text-sm text-muted">Choose the button text, screen corner, and accent color for your site.</p>
          </div>
          <WidgetAppearanceControls initialLabel={widgetLabel} initialPosition={widgetPosition} initialAccent={widgetAccent} businessName={org.name} disabled={ro} />
        </Card>
        {!ro && <SubmitButton className={btn.primary}>Save widget settings</SubmitButton>}
      </form>

      <Card className="mt-8 space-y-4">
        <h2 className="font-display text-2xl text-ink">Add it to your site</h2>
        {tokenMissing ? (
          <Notice kind="error">{ro ? 'This widget does not have a code yet. An owner or admin needs to create one before the snippet appears.' : 'This widget does not have a code yet. Create a new code below to get the snippet for your site.'}</Notice>
        ) : (
          <>
            <p className="max-w-prose text-sm text-muted">Paste this just before the closing body tag on every page where you want the button. It adds a “{widgetLabel}” button in the {widgetPosition === 'left' ? 'left' : 'right'} corner.</p>
            <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-4 text-sm text-ink"><code>{snippet}</code></pre>
          </>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {!tokenMissing && <CopyButton text={snippet} />}
          {!ro && <form action={rotateWidgetToken}><SubmitButton className={btn.secondary} pending="Creating">Create a new code</SubmitButton></form>}
        </div>
        <p className="text-xs text-faint">The embed code includes your saved label, position, and accent color. Creating a new code stops the old snippet from working.</p>
      </Card>

    </>
  )
}
