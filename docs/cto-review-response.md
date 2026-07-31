# Response to the CTO review

Every point checked against the source, not the screenshots. Where the finding
was right, it is fixed and there is now a test stopping it coming back. Where
it was based on a misreading, the evidence is below.

Run `npm run typecheck && npm run lint && npm run format:check && npm test && npm run verify`
to reproduce any of this.

---

## Fixed — the review was right

### No type safety → validation on every action

TypeScript was already `strict` and clean, but the review's real point stands:
**there was no runtime validation**. `zod` was in `package.json` and imported
nowhere. Server actions cast `FormData` with `String(x)` and `Number(x)`, which
accepts anything and fails later as a database error.

Every action now parses through a schema declared beside it
(`src/lib/forms.ts` + per-file schemas). A guard test fails the build if a raw
`String(formData.get(...))` ever reappears.

This closed a **real security hole** nobody had spotted: `/login?next=…`
redirected to whatever it was given, including `https://evil.example`. `next`
is now validated as a relative path. There is a test for it.

### No error handling → boundaries, loading states, not-found

Inline feedback existed (every action returned `{ error }` rendered in an
`Alert`, every submit button had a pending state), but the review is right that
**route-level handling was missing entirely**. Added:

| File | Catches |
| --- | --- |
| `app/error.tsx` | any failure under the app root |
| `app/global-error.tsx` | failures in the root layout itself |
| `app/not-found.tsx` | missing pages, and records you may not access |
| `app/loading.tsx`, `partner/`, `admin/`, `rider/` | route transitions |
| `partner/error.tsx`, `admin/error.tsx` | segment-specific recovery |

Error screens never print the raw message — a constraint name tells the user
nothing and an attacker something. They show the digest, which correlates with
the server log.

### No testing → 61 unit tests + 42 business checks

`npm test` — 61 assertions over the pure logic that money and business rules
depend on: minor-unit conversion, fee and cashback maths, haversine distance,
ETA, the supply-chain tier rules verbatim from PRD §12, and validation.

Two things worth calling out:

- The cashback test asserts an **invariant, not a value**: set `CASHBACK_BPS` to
  90% and the reward still cannot exceed the commission funding it.
- `src/conventions.test.ts` enforces the architecture: no hardcoded hosts, no
  `NEXT_PUBLIC_` variables, no client component reading `process.env` or
  importing a database module, no unvalidated action. These are the review's
  own concerns, turned into build failures instead of review comments.

`npm run verify` remains the integration layer — 42 checks against the real
services and database.

### No code quality discipline → ESLint, Prettier, CI

ESLint (flat config, `next/core-web-vitals` + `next/typescript`) and Prettier
are configured with `lint`, `lint:fix`, `format`, `format:check` scripts.

Lint immediately found **a real React bug**: `SearchBar` called `setState`
synchronously inside an effect body, causing a cascading re-render on every
keystroke. Fixed by deriving the value instead. It also found three dead
imports.

`.github/workflows/ci.yml` runs typecheck → lint → format → unit tests, plus
seed-and-verify and a production build, on every push and PR.

**Husky and Commitlint are not installed, and cannot be**: this directory is
not a git repository. They hook git, so they need `git init` first. Same for
"push to GitHub" — I have not created a remote or pushed anything, since that
publishes the code and is your call, not mine.

---

## Not accurate — checked against the source

### "Hardcoded URLs: he is calling http://localhost:3210 in the frontend"

`localhost:3210` appears nowhere in the application. It was **my terminal
smoke-test loop**, which is what the screenshot in the review shows:

```powershell
$resp = Invoke-WebRequest -Uri "http://localhost:3210$r" -UseBas...
```

That is a shell command run against a dev server, not shipped code. Verify:

```bash
grep -rn "localhost\|http://" src/    # no matches
```

The app makes exactly one browser-side request, and it is relative:
`fetch('/api/autocomplete?q=…')`. Everything else is a server component
querying the database directly — there is no HTTP hop to configure a base URL
for. `NEXT_PUBLIC_API_BASE_URL` would be an unused variable.

A test now enforces that every `fetch()` target stays relative.

### "Credentials/Secrets: they must never live in frontend code"

Agreed as a principle, and already true. There is **no `NEXT_PUBLIC_` variable
anywhere** — that prefix is the only way Next.js exposes an env var to the
browser. Payment provider keys are read inside server-only modules. No client
component reads `process.env`. All three are now enforced by tests.

### "No TypeScript types or validation"

The codebase is TypeScript throughout with `"strict": true`, and
`tsc --noEmit` passes clean. The **validation** half of this was correct and is
fixed above.

### "No API abstraction layer: each screen is likely calling APIs directly"

No screen calls an API. There are 16 service modules under `src/modules/`, each
owning its tables and exposing an async interface:

```
identity  organisations  catalog  inventory  recommendation  search  orders
payments  wallet  logistics  messaging  notifications  analytics  favourites
platform  events
```

Pages call those services; they never touch SQL. That is the abstraction layer
`/lib/api` was asking for — it just sits at the domain boundary rather than an
HTTP one, because in a server-component app there is no HTTP boundary to wrap.
The suggested `axios` client would add a network round-trip to the same
process.

---

## Recommendations I have not followed, and why

These are judgement calls. Happy to be overruled — but not by default.

### React Query / Zustand / Redux Toolkit

React Query solves caching, deduplication and invalidation for **client-side
fetching**. This app has none: pages are server components that query
PostgreSQL directly, and mutations are server actions that call
`revalidatePath`. There is no client cache to keep in sync.

Adding it would mean converting server components to client components,
introducing the API layer to fetch from, and shipping a cache to the browser —
strictly more code, more JavaScript on a mid-range Android phone, and a new
class of stale-data bug, to solve a problem the architecture does not have.

The only client state that exists is form state (`useActionState`) and the
basket (a cookie, read server-side). Neither needs a store.

**If we move to a separate API and a native app, this changes and React Query
becomes the right answer.** Worth revisiting at that point.

### Shadcn UI

Shadcn is Radix primitives plus Tailwind, copied into your repo. The concern
behind the recommendation — consistency — is already handled:
`src/components/ui.tsx` is a single set of primitives (`Card`, `Button`,
`Badge`, `Stat`, `Field`, `Alert`, `EmptyState`, `Rating`, `Thumb`) that every
screen uses.

More importantly, **the Brand Identity Guide is the governing document here**,
and it mandates specific colours, typography, corner radii and icon treatment.
Adopting a component library means either restyling every component back to the
guide, or drifting from it. Our primitives implement the guide directly.

Where Radix genuinely earns its weight is complex accessible widgets — combobox,
dialog, date picker. When we need one, importing Radix for that component is
the right call. Wholesale adoption is not.

### Swagger/OpenAPI for all API contracts

There is currently **one** HTTP endpoint (`/api/autocomplete`). Everything else
is internal TypeScript interfaces, which are already typed and checked at
compile time — an OpenAPI document describing them would be a second source of
truth that drifts.

This becomes right the moment we expose the Developer Platform the System
Architecture Document calls for. I would generate the spec from the route
handlers at that point rather than hand-maintain it.

---

## What I would add to the list

Two things that did not come up and matter more than several that did:

1. **No database migrations.** Schema changes currently require
   `npm run db:reset`, which drops all data. Fine while everything is seeded,
   unacceptable the moment a real merchant lists real stock. This is the next
   piece of infrastructure, ahead of anything else here.

2. **PGlite is single-process.** The embedded database is right for local
   development and CI, but staging and production need a real PostgreSQL server
   with a connection pool. The switch is one environment variable
   (`DATABASE_URL`) and no code change — but it has to actually happen before
   launch, and it should be in the deployment checklist rather than assumed.

---

## Current state

```
npm run typecheck     clean
npm run lint          clean
npm run format:check  clean
npm test              61 passed, 0 failed
npm run verify        42 passed, 0 failed
npm run build         37 routes
```
