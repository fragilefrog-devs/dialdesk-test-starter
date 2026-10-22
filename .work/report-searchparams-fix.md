# Next.js 16 `searchParams` / `params` Promise migration — report

**Scope:** fix the `searchParams` / `params` "must be a Promise" runtime defect class.
**Reference pattern:** `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx` (already migrated; left untouched).
**Version convention:** read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` (Next 16.4.2) and
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`. Both confirm `params` and `searchParams`
are Promises and must be unwrapped with `await` (or `React.use()` in Client Components). All pages here are Server Components,
so `await` is used throughout.

---

## 1. Files changed

### 1.1 `src/app/(dashboard)/dashboard/agent/page.tsx`

| | |
|---|---|
| **Before** | `export default async function AgentPage({ searchParams }: { searchParams: { error?: string; ok?: string } }) {` |
| **After** | `export default async function AgentPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {` |

Added as the first statement of the function body:

```tsx
const { error, ok } = await searchParams
```

Body usages updated (markup otherwise untouched):

- `{searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}` → `{error && <Notice kind="error">{error}</Notice>}`
- `{searchParams.ok && <Notice kind="success">{searchParams.ok}</Notice>}` → `{ok && <Notice kind="success">{ok}</Notice>}`

---

### 1.2 `src/app/(dashboard)/dashboard/billing/page.tsx`

| | |
|---|---|
| **Before** | `export default async function Billing({ searchParams }: { searchParams: { status?: string } }) {` |
| **After** | `export default async function Billing({ searchParams }: { searchParams: Promise<{ status?: string }> }) {` |

Added:

```tsx
const { status } = await searchParams
```

Body usage updated:

- `{searchParams.status === 'success' && <Notice kind="success">Thanks! Your plan will update in a few seconds.</Notice>}`
  → `{status === 'success' && <Notice kind="success">Thanks! Your plan will update in a few seconds.</Notice>}`

---

### 1.3 `src/app/(dashboard)/dashboard/knowledge/page.tsx`

| | |
|---|---|
| **Before** | `export default async function Knowledge({ searchParams }: { searchParams: { error?: string } }) {` |
| **After** | `export default async function Knowledge({ searchParams }: { searchParams: Promise<{ error?: string }> }) {` |

Added:

```tsx
const { error } = await searchParams
```

Body usage updated:

- `{searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}` → `{error && <Notice kind="error">{error}</Notice>}`

---

### 1.4 `src/app/(dashboard)/dashboard/numbers/page.tsx`

| | |
|---|---|
| **Before** | `export default async function Numbers({ searchParams }: { searchParams: { error?: string; ok?: string; country?: string; area?: string } }) {` |
| **After** | `export default async function Numbers({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; country?: string; area?: string }> }) {` |

Added:

```tsx
const { error, ok, country: countryParam, area } = await searchParams
```

> **Note on the `country` rename:** the page already had a *local* variable named `country`
> (`const country = /^[A-Za-z]{2}$/.test(searchParams.country ?? '') ? searchParams.country!.toUpperCase() : 'US'`),
> which is the normalised 2-letter ISO code and is used by `searchNumbers(country, …)` and `defaultValue={country}`.
> To avoid shadowing/renaming that existing local (which would have touched logic beyond the await), the
> *raw* query value is destructured as `countryParam`. The normalisation expression, the local `country`,
> and every downstream use of it are **byte-for-byte unchanged** in behaviour.

Body usages updated:

- `const country = /^[A-Za-z]{2}$/.test(searchParams.country ?? '') ? searchParams.country!.toUpperCase() : 'US'`
  → `const country = /^[A-Za-z]{2}$/.test(countryParam ?? '') ? countryParam!.toUpperCase() : 'US'`
- `if (searchParams.country || searchParams.area) {` → `if (countryParam || area) {`
- `searchNumbers(country, /^\d{2,4}$/.test(searchParams.area ?? '') ? searchParams.area : undefined)`
  → `searchNumbers(country, /^\d{2,4}$/.test(area ?? '') ? area : undefined)`
- `{searchParams.error && …}` → `{error && …}`; `{searchParams.ok && …}` → `{ok && …}`
- `defaultValue={searchParams.area}` → `defaultValue={area}`

---

### 1.5 `src/app/(dashboard)/dashboard/page.tsx`

| | |
|---|---|
| **Before** | `export default async function Overview({ searchParams }: { searchParams: { welcome?: string } }) {` |
| **After** | `export default async function Overview({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {` |

Added:

```tsx
const { welcome } = await searchParams
```

Body usage updated:

- `<PageHeader title={searchParams.welcome ? \`Welcome, ${org.name}\` : 'Overview'} … />`
  → `<PageHeader title={welcome ? \`Welcome, ${org.name}\` : 'Overview'} … />`

---

### 1.6 `src/app/(dashboard)/dashboard/team/page.tsx`

| | |
|---|---|
| **Before** | `export default async function Team({ searchParams }: { searchParams: { error?: string; ok?: string } }) {` |
| **After** | `export default async function Team({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {` |

Added:

```tsx
const { error, ok } = await searchParams
```

Body usages updated:

- `{searchParams.error && …}` → `{error && …}`; `{searchParams.ok && …}` → `{ok && …}`

---

### 1.7 `src/app/invite/[token]/page.tsx` — **both `params` and `searchParams`**

| | |
|---|---|
| **Before** | `export default async function Invite({ params, searchParams }: { params: { token: string }; searchParams: { error?: string } }) {` |
| **After** | `export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {` |

Added (first two statements of the body):

```tsx
const { token } = await params
const { error } = await searchParams
```

Body usages updated:

- `redirect(\`/login?next=/invite/${params.token}\`)` → `redirect(\`/login?next=/invite/${token}\`)`
- `{searchParams.error && <p role="alert" …>…</p>}` → `{error && <p role="alert" …>…</p>}`
- `<input type="hidden" name="token" value={params.token} />` → `<input type="hidden" name="token" value={token} />`

The server action `accept(fd: FormData)` reads the token from the form body and was **not** touched.

---

### 1.8 `src/app/onboarding/page.tsx`

| | |
|---|---|
| **Before** | `export default async function Onboarding({ searchParams }: { searchParams: { error?: string } }) {` |
| **After** | `export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {` |

Added:

```tsx
const { error } = await searchParams
```

Body usage updated:

- `{searchParams.error && <Notice kind="error">{searchParams.error}</Notice>}` → `{error && <Notice kind="error">{error}</Notice>}`

---

## 2. Files changed OUTSIDE the original 8

### 2.1 `src/app/sites/[slug]/page.tsx` — **9th file, same defect class, genuinely broken**

This page was **not** in the original 8, but `grep -rn "params\." src/app/ --include="page.tsx"` found it, and it is the
same defect class, so per the brief it was fixed and is called out explicitly here.

Both `params.slug` accesses were reading a property off a Promise. In Next 16 this throws
`Route "/sites/[slug]" used \`params.slug\`. \`params\` is a Promise and must be unwrapped…`;
even if it did not throw, `params.slug` would be `undefined` and `getOrg(undefined)` would blow up on `slug.toLowerCase()`.

| | |
|---|---|
| **Before (generateMetadata)** | `export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {` |
| **After (generateMetadata)** | `export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {` |
| **Before (page)** | `export default async function Site({ params }: { params: { slug: string } }) {` |
| **After (page)** | `export default async function Site({ params }: { params: Promise<{ slug: string }> }) {` |

Added in both functions:

```tsx
const { slug } = await params
```

Body usages updated:

- `const org = await getOrg(params.slug)` → `const org = await getOrg(slug)` (in `generateMetadata` and in `Site`)

`generateMetadata` was included because the Next 16 metadata reference
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`, lines 54–63, 83–85) documents
`params`/`searchParams` as Promises there too.

### 2.2 `package.json` — required to make the mandated `npm run lint` gate runnable

`next lint` was **removed in Next.js 16** (confirmed: `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`
contains no `lint` command; `node_modules/next/dist/cli/next-cli.js` has no `lint` subcommand). With `next@16.4.2`, the
script failed with:

```
> ai-voice-receptionist@1.0.0 lint
> next lint

Invalid project directory provided, no such directory: H:\ai-voice-receptionist-saas\starter\lint
```

(`next` fell through to `next dev` and treated `lint` as a directory argument.) This is a **pre-existing** breakage from the
Next 16 upgrade, not caused by the `searchParams` work — but the brief mandates that `npm run lint` must pass, so the script
was repointed at the ESLint CLI that the repo already depends on (`eslint@^8.57.1` + `eslint-config-next@^14.2.35` +
the existing `.eslintrc.json`).

| | |
|---|---|
| **Before** | `"lint": "next lint",`<br>`"test": "tsc --noEmit && next lint"` |
| **After** | `"lint": "eslint src --ext .ts,.tsx",`<br>`"test": "tsc --noEmit && eslint src --ext .ts,.tsx"` |

Rationale for the scope `src --ext .ts,.tsx`:

- All Next.js app code lives under `src/` (`src/app`, `src/components`, `src/lib`, `src/ai`, `src/styles`).
  The only non-TS file in `src/` is `src/styles/globals.css` (not an ESLint target).
- `--ext .ts,.tsx` is **required**: with ESLint 8, `eslint <dir>` only picks up `.js` by default, so a bare `eslint src`
  would silently lint **zero** TypeScript files.
- `voice-gateway/` is deliberately excluded: it is a **separate standalone sub-project** with its own `package.json`,
  own `tsconfig.json`, own dependency tree and **no** ESLint dependency/config. Running `eslint .` over the repo root pulls
  it in and reports one pre-existing `prefer-const` error in `voice-gateway/src/local-speech.ts:84` (see §4).
- The `test` script was updated in the same edit because it chained the same removed `next lint` binary — leaving it would
  have kept a second broken script referencing a deleted command.

No other package.json field was touched. `next.config.mjs` was **not** touched.

---

## 3. Verification

### 3.1 `npm run type-check` — PASS

Run from repo root (`H:\ai-voice-receptionist-saas\starter`). Verbatim output:

```
> ai-voice-receptionist@1.0.0 type-check
> tsc --noEmit

EXIT=0
```

Zero errors.

> Note: `npm run type-check` **also passed before any of my changes**. The original code typed `searchParams` as a plain
> object (`{ error?: string }`), so TypeScript was satisfied while Next 16 passed a real Promise at runtime — the defect was
> purely a runtime one and `tsc` could never have caught it. The type change is what makes the code honest about the
> Promise contract and lets `tsc` police future regressions.

### 3.2 `npm run lint` — PASS

Run from repo root. Verbatim output:

```
> ai-voice-receptionist@1.0.0 lint
> eslint src --ext .ts,.tsx

EXIT=0
```

Zero errors, zero warnings.

### 3.3 Grep proof

**`grep -rn "searchParams\." src/app/ --include="page.tsx"` → ZERO hits** (exit code 1 = no matches).

Every former `searchParams.x` access now reads an already-destructured local (`error`, `ok`, `status`, `welcome`,
`countryParam`, `area`). No page in `src/app` accesses `searchParams.` on the prop object any more.

**`grep -rn "await searchParams" src/app/ --include="page.tsx"` → 10 hits** (all migrated pages):

```
src/app/(auth)/login/page.tsx:8:  const { error, notice, next } = await searchParams
src/app/(auth)/signup/page.tsx:8:  const { error } = await searchParams
src/app/(dashboard)/dashboard/agent/page.tsx:11:  const { error, ok } = await searchParams
src/app/(dashboard)/dashboard/billing/page.tsx:9:  const { status } = await searchParams
src/app/(dashboard)/dashboard/knowledge/page.tsx:8:  const { error } = await searchParams
src/app/(dashboard)/dashboard/numbers/page.tsx:10:  const { error, ok, country: countryParam, area } = await searchParams
src/app/(dashboard)/dashboard/page.tsx:9:  const { welcome } = await searchParams
src/app/(dashboard)/dashboard/team/page.tsx:9:  const { error, ok } = await searchParams
src/app/invite/[token]/page.tsx:23:  const { error } = await searchParams
src/app/onboarding/page.tsx:13:  const { error } = await searchParams
```

(8 of the original 8 + the 2 already-migrated reference pages.)

**`grep -rn "await params" src/app/ --include="page.tsx"` → 3 hits:**

```
src/app/invite/[token]/page.tsx:22:  const { token } = await params
src/app/sites/[slug]/page.tsx:11:  const { slug } = await params
src/app/sites/[slug]/page.tsx:17:  const { slug } = await params
```

**Combined safety net — `grep -rn "params\.\|searchParams\." src/app/ --include="page.tsx"` → ZERO hits** (exit code 1).
There is no remaining un-awaited prop access anywhere under `src/app/**/page.tsx`.

---

## 4. Found but NOT changed (and why)

| Item | Why not changed |
|---|---|
| `src/app/api/webhooks/twilio/status/route.ts`, `src/app/api/webhooks/twilio/voice/route.ts` — local `const params = Object.fromEntries(new URLSearchParams(await req.text()))` | These `params` are **Twilio form fields** parsed from the request body, not Next.js route/page props. Route handlers are unaffected by the page-props Promise change. Not a defect. |
| `src/app/api/voice/config/route.ts`, `src/app/api/webhooks/…`, `src/app/auth/callback/route.ts` | Same — route-handler request parsing, not page props. |
| `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx` | Already migrated (the reference pattern). Explicitly owned by another agent — not touched. |
| `next.config.mjs`, `src/app/(auth)/actions.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/errors.ts` | Explicitly out of scope / owned by another agent. Not touched. |
| `.env.local`, `.env*`, anything under `.next/` | Explicitly forbidden. Not touched. |
| `voice-gateway/src/local-speech.ts:84` — pre-existing ESLint `prefer-const` error (`'magnitude' is never reassigned`) | Not part of the Next.js app (separate sub-project with its own `package.json`/`tsconfig.json` and no ESLint setup). Fixing it would mean editing an unrelated service, and the root lint scope deliberately excludes `voice-gateway/`. Reported, not touched. |
| `src/app/api/{health,widget-script,billing…` — literal brace-named directories | Empty artifacts of a shell brace-expansion that failed on Windows. They contain **no files**, so they produce no routes and no runtime effect. Cosmetic; deleting them is outside this defect class. Flagging for whoever owns the tree. |
| Dev server on port 3000 | **Already stopped before this session began.** `dev.log` last wrote at `16:42:07` and `dev.err.log` at `16:40:11`; my first file edit was at `16:45:40`. Port 3000 now refuses connections (`ECONNREFUSED`). I did **not** start a server and did **not** kill any process — per the brief I never ran `npm run dev`. Nothing in this change depends on a running dev server, and the mandate to leave it up was honoured in the sense that I never touched it; its absence is pre-existing and outside my control. |
| `src/app/(dashboard)/dashboard/{appointments,calls,install,leads}/page.tsx`, `src/app/(portal)/admin/page.tsx`, `src/app/{page,pricing,privacy,terms,widget-demo}/page.tsx` | These pages take **no** `params`/`searchParams` props at all (`export default async function X() {`), so they are unaffected by this defect class. Verified individually. |

---

## 5. Summary for review

- **9 page files** migrated to the Next 16 Promise contract (8 in the brief + `src/app/sites/[slug]/page.tsx`, which was
  genuinely broken in the same way and is called out above).
- **`package.json`** lint/test scripts repointed from the removed `next lint` to the ESLint CLI, because the mandated
  `npm run lint` gate could not otherwise execute.
- **No** markup, styling, imports, copy, or business logic was changed. The only behavioural delta is that `searchParams` /
  `params` are now awaited instead of read as plain objects.
- **Gates:** `npm run type-check` PASS (0 errors) · `npm run lint` PASS (0 errors) · grep proof clean (0 un-awaited prop accesses).
- **For Vision:** re-check the `/onboarding`, `/invite/[token]`, and `/sites/[slug]` routes — the three whose error banners /
  slug lookups were previously throwing at runtime. `/sites/[slug]` was the only one with no `searchParams` at all and was
  broken purely on `params`.
- **For Probe:** exercise `?error=`, `?ok=`, `?status=success`, `?welcome=1`, `?country=GB`, `?area=020`, and `?next=` query
  strings on the migrated routes, plus `/sites/<slug>` and `/invite/<token>` with a valid/invalid token, and assert the
  banner copy renders and the slug/token round-trips correctly.
