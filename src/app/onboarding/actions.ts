'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase/server'
import { RESERVED_SLUGS, slugify } from '@/lib/slug'

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(3).max(40),
  industry: z.enum(['clinic', 'dental', 'real_estate', 'home_services', 'salon', 'legal', 'restaurant', 'other']),
  timezone: z.string().max(64),
})

export async function createOrganization(fd: FormData) {
  const p = schema.safeParse(Object.fromEntries(fd))
  if (!p.success) redirect('/onboarding?error=' + encodeURIComponent('Please check the form fields.'))
  const slug = slugify(p.data!.slug)
  if (slug.length < 3 || RESERVED_SLUGS.has(slug)) redirect('/onboarding?error=' + encodeURIComponent('Choose a different web address.'))
  try { new Intl.DateTimeFormat('en-US', { timeZone: p.data!.timezone }) } catch { redirect('/onboarding?error=Invalid+timezone') }

  const { error } = await (await supabaseServer()).rpc('create_organization', {
    p_name: p.data!.name, p_slug: slug, p_industry: p.data!.industry, p_timezone: p.data!.timezone,
  })
  if (error) redirect('/onboarding?error=' + encodeURIComponent(error.code === '23505' ? 'That web address is taken.' : 'Could not create your workspace.'))
  redirect('/dashboard?welcome=1')
}
