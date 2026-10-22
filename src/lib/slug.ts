export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
export const RESERVED_SLUGS = new Set(['admin', 'api', 'app', 'dashboard', 'login', 'signup', 'pricing', 'sites', 'www', 'widget', 'onboarding', 'terms', 'privacy'])
