import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Supabase settings that `.env.local` owns.
 *
 * Next.js resolves env vars with `process.env` taking precedence over `.env*`
 * files (see node_modules/next/dist/docs/01-app/02-guides/environment-variables.md
 * -> "Environment Variable Load Order"). A stale `NEXT_PUBLIC_SUPABASE_URL`
 * exported by the ambient shell therefore silently shadows `.env.local`: every
 * Auth request then fails DNS and the UI reports "Could not reach Supabase
 * Auth" even though the network is fine.
 *
 * In development we let `.env.local` win for these keys so the project's own
 * config is the source of truth. Production keeps `process.env` precedence
 * because deployments inject the real secrets there.
 */
const LOCAL_SUPABASE_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

/** Point the Supabase env at `.env.local`, overriding stale ambient values. */
function applyLocalSupabaseEnv() {
  const localFile = path.join(process.cwd(), '.env.local')
  if (!existsSync(localFile)) return
  if (typeof process.loadEnvFile !== 'function') {
    console.warn('[next.config] process.loadEnvFile unavailable (Node < 20.12) — .env.local not applied')
    return
  }

  const ambient = Object.fromEntries(LOCAL_SUPABASE_ENV_KEYS.map((key) => [key, process.env[key]]))
  const shadowed = LOCAL_SUPABASE_ENV_KEYS.filter((key) => ambient[key] !== undefined)
  if (!shadowed.length) return

  // The loader never overwrites a variable that is already set, so clear the
  // ambient values first, then let `.env.local` repopulate them.
  for (const key of shadowed) delete process.env[key]
  try {
    process.loadEnvFile(localFile)
  } catch (error) {
    for (const key of shadowed) process.env[key] = ambient[key]
    console.warn('[next.config] failed to load .env.local:', error.message)
    return
  }

  for (const key of shadowed) {
    if (process.env[key] === undefined) {
      process.env[key] = ambient[key] // absent from .env.local — keep the ambient value
    } else {
      console.log(`[next.config] ${key} <- .env.local (overrides ambient environment)`)
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  async headers() {
    const common = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ];
    return [
      {
        // Public business pages host the same-origin call iframe and need to delegate the microphone.
        source: '/((?!embed/|business/).*)',
        headers: [
          ...common,
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
        ],
      },
      {
        source: '/business/:path*',
        headers: [
          ...common,
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
        ],
      },
      {
        // The widget page is framed by customer sites (checked per business in the page) and needs the microphone
        source: '/embed/:path*',
        headers: [
          ...common,
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      { source: '/widget.js', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }] },
    ];
  },
};

export default (phase) => {
  // Production injects real secrets through the environment; only local phases
  // let `.env.local` take precedence over an ambient (and possibly stale) value.
  if (phase !== 'phase-production-build' && phase !== 'phase-production-server') {
    applyLocalSupabaseEnv()
  }
  return nextConfig
};
