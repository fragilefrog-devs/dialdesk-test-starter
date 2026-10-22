import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const PROTECTED = ['/dashboard', '/onboarding', '/admin']
const AUTH_PAGES = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request)
  const path = request.nextUrl.pathname

  if (!user && PROTECTED.some((p) => path === p || path.startsWith(p + '/'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }
  if (user && AUTH_PAGES.includes(path)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return response
}

export const config = {
  // Skip static assets and all API routes (webhooks authenticate themselves)
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|widget.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
