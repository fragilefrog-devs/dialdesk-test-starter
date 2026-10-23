import { SubmitButton } from '@/components/SubmitButton'
import type { Metadata } from 'next'
import { requireOrg } from '@/lib/auth'
import { addDoc, deleteDoc } from '../actions'
import { btn, Card, Empty, input, label, Notice, PageHeader } from '@/components/ui'
export const metadata: Metadata = { title: 'Knowledge' }

export default async function Knowledge({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const { supabase, org, role } = await requireOrg()
  const { data: docs } = await supabase.from('knowledge_docs').select('id, title, content').eq('org_id', org.id).order('created_at', { ascending: false })
  return (
    <>
      <PageHeader title="Knowledge" sub="Services, prices, policies, location, FAQs — the receptionist only states what’s here." />
      {error && <Notice kind="error">{error}</Notice>}
      {role !== 'member' && (
        <Card className="mb-6">
          <form action={addDoc} className="space-y-3">
            <div><label htmlFor="title" className={label}>Title</label><input id="title" name="title" required maxLength={120} className={input} placeholder="Pricing & services" /></div>
            <div><label htmlFor="content" className={label}>Content</label><textarea id="content" name="content" rows={6} required minLength={10} maxLength={8000} className={input} placeholder="Teeth cleaning is $90 and takes 45 minutes. We accept most major insurance…" /></div>
            <SubmitButton className={btn.primary}>Add document</SubmitButton>
          </form>
        </Card>
      )}
      {!docs?.length ? <Empty title="Nothing yet" body="Add your services, prices, hours, parking and policies. Short, factual paragraphs work best." /> : (
        <div className="space-y-3">{docs.map((d) => (
          <Card key={d.id} className="flex items-start justify-between gap-4">
            <div className="min-w-0"><p className="font-semibold text-ink">{d.title}</p><p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted">{d.content}</p></div>
            {role !== 'member' && <form action={deleteDoc}><input type="hidden" name="id" value={d.id} /><button className={btn.danger}>Delete</button></form>}
          </Card>
        ))}</div>
      )}
    </>
  )
}
