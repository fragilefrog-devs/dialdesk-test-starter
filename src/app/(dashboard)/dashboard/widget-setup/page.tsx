import type { Metadata } from 'next'
import Link from 'next/link'
import { requireOrg } from '@/lib/auth'
import { appEnv } from '@/lib/env'
import { rotateWidgetToken, saveWidget } from '../actions'
import { CopyButton } from '@/components/CopyButton'
import { SubmitButton } from '@/components/SubmitButton'
import { WidgetAppearanceControls } from '@/components/WidgetAppearanceControls'
import { btn, Card, input, label, Notice, PageHeader } from '@/components/ui'
import { domainsWithAppHost } from '@/lib/widget'
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
        <PageHeader title="Website voice widget" sub="Preview and configure the voice button customers use on your website." />
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
  const allowedDomains = domainsWithAppHost(((a.widget_domains as string[] | null) ?? []).join('\n'), app)
  const snippet = tokenMissing ? '' : `<script src="${app}/widget.js" data-token="${a.widget_token}" data-label="${escapeAttribute(widgetLabel)}" data-position="${widgetPosition}" data-accent="${widgetAccent}" async></script>`
  const ro = role === 'member'
  const keyMissing = !process.env.VAPI_PUBLIC_KEY
  const notReady = !a.vapi_assistant_id

  return (
    <>
      <PageHeader
        title="Website voice widget"
        sub="Preview and configure the voice button customers use on your website."
        action={<Link href={`/business/${org.slug}`} target="_blank" rel="noreferrer" className={btn.secondary}>View public business page</Link>}
      />
      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="success">{ok}</Notice>}
      {keyMissing && <Notice kind="error">The widget is not available yet: the server needs a Vapi public key (VAPI_PUBLIC_KEY). See DEPLOYMENT.md.</Notice>}
      {notReady && <Notice kind="error">Save your receptionist settings first so the voice assistant exists.</Notice>}

      <form action={saveWidget} className="space-y-6">
        <WidgetAppearanceControls initialLabel={widgetLabel} initialPosition={widgetPosition} initialAccent={widgetAccent} businessName={org.name} disabled={ro} />
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card className="!p-5">
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold text-ink">Widget settings</h2>
              <p className="mt-1 text-sm text-muted">Set availability and allowed websites.</p>
            </div>
            <fieldset disabled={ro} className="flex flex-col gap-4">
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={a.widget_enabled} className="mt-1" />
                <span>
                  <span className="font-medium text-ink">Turn on the website widget</span>
                  <span className="mt-1 block text-muted">Visitors are told they are speaking with AI and calls may be recorded. Calls use your plan minutes.</span>
                </span>
              </label>
              <div>
                <label htmlFor="domains" className={label}>Allowed websites</label>
                <textarea id="domains" name="domains" rows={2} defaultValue={allowedDomains.join('\n')} className={input} placeholder="alderstreetplumbing.com" />
                <p className="mt-2 text-xs text-faint">Your DialDesk app domain is included automatically. Add one domain per line for other sites; subdomains are included.</p>
              </div>
            </fieldset>
            {!ro && <SubmitButton className={`${btn.primary} mt-5`}>Save widget settings</SubmitButton>}
          </Card>

          <Card className="min-w-0 !p-5">
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold text-ink">Add it to your site</h2>
              <p className="mt-1 text-sm text-muted">Paste this code before the closing body tag on each allowed page.</p>
            </div>
            {tokenMissing ? (
              <Notice kind="error">{ro ? 'This widget does not have a code yet. An owner or admin needs to create one before the snippet appears.' : 'This widget does not have a code yet. Create a new code below to get the snippet for your site.'}</Notice>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted">The “{widgetLabel}” button will appear in the {widgetPosition === 'left' ? 'left' : 'right'} corner.</p>
                <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-4 text-sm text-ink"><code>{snippet}</code></pre>
              </>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {!tokenMissing && <CopyButton text={snippet} />}
              {!ro && <SubmitButton className={btn.secondary} pending="Creating" formAction={rotateWidgetToken}>Create a new code</SubmitButton>}
            </div>
            {!tokenMissing && <p className="mt-3 text-xs text-faint">Creating a new code stops the old snippet from working.</p>}
          </Card>
        </div>
      </form>

    </>
  )
}
