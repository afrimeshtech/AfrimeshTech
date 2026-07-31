# AfriMesh Commerce Platform — Project Nexus

Proximity Commerce & Payment Infrastructure Platform (PCPIP).

Built from the four specification documents in `../`:

| Document | Volume | What it governed here |
| --- | --- | --- |
| Business Requirements Specification | — | Scope, user categories, business process flows, revenue model, KPIs |
| Product Requirements Document | Volume B | Functional requirements, business rules, MVP definition, non-functional targets |
| System Architecture Document | Volume III | Module boundaries, recommendation engine, wallet, payments, security, observability |
| Inventory Engineering Recommendation | — | The Distributed Commerce Inventory Engine |
| Brand Identity & Corporate Style Guide | Volume A | Colour, typography, logo, voice, UI and accessibility principles |
| Project Nexus infographic | — | Delivery-partner role, messaging, rewards, the six-step flow, the reference app layout |

---

## Quick start

```bash
npm install
npm run setup     # creates the schema and seeds a working Lagos pilot market
npm run dev       # http://localhost:3000
```

Sign in with any seeded account — password `afrimesh` for all of them:

| Role | Email | What you see |
| --- | --- | --- |
| Consumer | `ada@example.ng` | Storefront, search, basket, orders, wallet, messages |
| Retail outlet | `grace@gracestores.ng` | Outlet dashboard, inventory, one-tap restock from merchants |
| Merchant | `fatima@mushintrade.ng` | Wholesale dashboard, sourcing from warehouses |
| Dealer warehouse | `tunde@apapahub.ng` | Bulk inventory, merchant orders |
| Delivery partner | `sola@rider.ng` | `/rider` — job board, pickups, proof of delivery, earnings |
| Platform admin | `admin@afrimesh.africa` | Console: verification, moderation, ranking, fraud, logistics, health |
| Auditor | `auditor@afrimesh.africa` | The same console, read-only |

Phone + OTP sign-in also works. With no SMS provider configured the code is
printed to the server console and shown on screen.

```bash
npm test           # 61 unit tests + architecture guards
npm run verify     # 42 business-rule checks against the real service layer
npm run typecheck
npm run lint
npm run format
npm run build
```

CI runs all of the above on every push (`.github/workflows/ci.yml`).

A written response to the CTO review — what was accurate and fixed, what was
based on a terminal screenshot rather than the source, and the two
recommendations I pushed back on with reasons — is in
[`docs/cto-review-response.md`](docs/cto-review-response.md).

`npm run verify` and the database scripts need the dev server stopped — the
embedded database allows one process at a time.

---

## The database

The specifications call for PostgreSQL. This machine had no PostgreSQL server,
Docker or package manager available, so the default driver is **PGlite** —
PostgreSQL 16 compiled to WebAssembly, running in-process and storing data in
`./.pgdata`. It is real PostgreSQL: the same DDL, the same SQL, the same
`NUMERIC` overflow errors.

Point at a real server whenever you want; nothing else changes:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/afrimesh npm run setup
```

`src/db/client.ts` selects the driver from that one variable and exposes a
single `Sql` interface to everything above it. `src/db/schema.sql` is the
source of truth for the schema — plain PostgreSQL, 29 tables, readable
top to bottom.

**Caveat worth knowing:** PGlite is single-connection and single-process. That
is fine for development and it surfaced two genuine concurrency bugs during the
build (see *What the verification caught*), but production must use a real
server with a connection pool.

---

## Architecture

A **modular monolith**, exactly as the PRD's CTO note directs:

> Single deployable application. PostgreSQL as the primary database. Clearly
> defined module boundaries. Internal service interfaces to enable future
> extraction into microservices. Comprehensive event logging from day one.

```
src/
  db/
    schema.sql          the whole relational schema, grouped by owning module
    client.ts           driver abstraction + transactions
  modules/              ← the domain. No React, no Next.js, no HTTP.
    identity/           registration, password + OTP auth, sessions, RBAC
    organisations/      business identity, verification, trust
    catalog/            master product catalogue
    inventory/          the Distributed Commerce Inventory Engine
    recommendation/     the weighted ranking models
    search/             discovery over live nearby stock
    orders/             order lifecycle; the only module that composes others
    payments/           gateway abstraction
    wallet/             double-entry ledger with escrow
    logistics/          delivery jobs, rider assignment, proof of delivery
    messaging/          order-scoped buyer/seller conversations
    notifications/      multi-channel, retryable
    analytics/          the KPIs the BRS and PRD commit to
    favourites/         saved products and shops
    platform/           settings, fraud rules, system health
    events/             the event bus and immutable log
  lib/                  money, geography, supply-chain tiers, auth, cart
  app/                  Next.js App Router — routes and server actions only
  components/           brand system and UI
```

Every module exposes an async service interface and owns its tables. Nothing
reaches across a boundary into another module's tables — which is what makes
the SAD's eventual microservice extraction a refactor rather than a rewrite.

The domain modules deliberately have **no Next.js or React imports**. That is
why `scripts/seed.ts` and `scripts/verify.ts` can run them directly under plain
Node: a service that only works inside a React request is not extractable.

### The event log

Every meaningful state change is published through `modules/events`, which
appends to `event_log` and runs subscribers inside the publisher's transaction.
Event names match the inventory document exactly — `StockAdded`,
`StockReserved`, `StockReleased`, `StockSold`, `StockReturned`. That table is
the seam where Kafka is introduced when throughput demands it; publishers and
subscribers do not change.

---

## How the specification maps to code

### Supply-chain business rules (PRD §12)

> Consumers cannot purchase directly from warehouses. Retailers purchase from
> merchants. Merchants purchase from warehouses. Warehouses supply merchants only.

Encoding the chain as tier ordinals collapses all four rules into one
invariant — **a buyer at tier N may only buy from tier N−1** — enforced in
three independent places:

1. `lib/tiers.ts` → `canTrade()`, used by the UI and the cart
2. `modules/orders/service.ts` → `placeOrder()` rejects before writing anything
3. `orders.orders_tier_rule` → a `CHECK` constraint in the database

A new caller or a bad migration cannot bypass all three.

### The inventory engine

| Inventory doc | Implementation |
| --- | --- |
| §1 Master Product Catalogue | `products` — sellers list *against* it, never duplicate it |
| §2 Multi-level inventory | `inventory_items` scoped by `organisation_id`; the platform never owns stock |
| §3 Live Stock Engine | available / reserved / incoming / sold / returned / damaged, tracked separately |
| §4 Stock reservation | `reserveStock()` holds on order, releases on failure or TTL expiry |
| §5 Inventory ledger | `inventory_ledger`, append-only; quantities are a materialised view of it |
| §6 Location-aware | every stock row carries lat/lng and a delivery radius |
| §7 Batch & expiry | `inventory_batches`, mandatory for pharmacy and agro products |
| §8 Price layer | retail / wholesale / promotional prices and minimum order quantity |
| §9 Demand intelligence | `search_queries`, `product_views`, and the unmet-demand report |
| §10 Event-driven | every movement publishes its event |

The oversell guard is one SQL statement:

```sql
UPDATE inventory_items
   SET qty_available = qty_available - $2,
       qty_reserved  = qty_reserved + $2
 WHERE id = $1 AND qty_available >= $2
```

No read-then-write gap, so two shoppers racing for the last unit cannot both win.

### The recommendation engine

The SAD calls it "the platform's strategic differentiator". Weights live in the
`ranking_weights` table because the SAD requires them "configurable without
changing application code" — an operations lead retunes the marketplace from
`/admin/ranking` with no deployment.

Shipped consumer defaults, straight from the SAD: availability 30%, distance
25%, price 15%, seller rating 10%, delivery time 10%, trust 5%, purchase
history 5%. Separate models exist for outlet and merchant buyers.

Ranking runs **inside PostgreSQL** as a weighted expression over a CTE, not in
the application — the candidate set for a popular product in a dense city is
large, and pulling it into Node to sort would blow the PRD's two-second budget.
Measured on seed data: **~20 ms**.

Each result carries its own score breakdown, so the UI can explain *why* a shop
ranked first. Publishing the formula is a brand requirement, not decoration:
"Transparent pricing" and "Trust by Design" mean no hidden paid placement.

### Payments and the wallet

The payment module abstracts providers behind one `PaymentGateway` interface,
so Paystack, Flutterwave, a USSD rail or a QR scheme is one adapter and no
business logic changes. A `mock` gateway ships as the default.

All methods converge on the wallet: an external charge deposits into the
buyer's wallet, then the wallet pays the order. One money path means one place
to reason about the ledger.

The ledger is **double-entry**, as the SAD requires. `postTransaction()`
refuses to write anything where debits ≠ credits, so a bug in a calling module
cannot knock the books out of balance. Seller proceeds land in **escrow** and
are released only when the buyer confirms delivery.

Two invariants are checked live on `/admin` and by `npm run verify`:

- every transaction balances;
- the sum of all wallets is exactly zero — customer balances offset by the
  platform float. Anything else means value was created or destroyed.

### Logistics, messaging and rewards

These three came from the Project Nexus infographic, which treats delivery
partners as a first-class participant and puts Messages in the primary tab bar.

**Delivery.** Dispatching an order raises a job in the same transaction, so an
order cannot be dispatched with no work existing for anyone to pick up. Riders
see an open board ranked by distance from the **pickup**, not the drop-off,
with the fee stated before they accept. Claiming is race-safe the same way
stock reservation is — the `UPDATE` carries `WHERE status = 'unassigned'`, so
the second rider is told the job has gone rather than both believing they have
it. Completing a job records proof of delivery, advances the order and pays
the rider, atomically.

**The delivery fee had to move.** It used to land in the seller's escrow along
with the goods, which left nothing to pay a rider from. It is now held in a
separate platform logistics escrow at payment time and settled on delivery: to
the rider if one carried it, back to the seller if they delivered it
themselves, and back to the buyer if the order is cancelled. All three paths
keep the ledger balanced, and `npm run verify` checks each one.

**Messaging** is scoped to an order rather than open-ended. That gives both
sides a verifiable shared subject, makes access control a single question
(are you the buyer on this order, or do you work for the seller?), and stops
the inbox becoming a cold-outreach channel as the network grows.

**Cashback** is credited when the buyer confirms receipt, funded from platform
revenue and automatically capped at the commission rate — a reward can never
exceed the margin that pays for it.

**One-tap restock** implements steps 5 and 6 of the infographic's flow. It
takes everything at or below its reorder level, finds who upstream can supply
it, and picks the single supplier covering the most of the shortfall — because
an order settles with one seller, so one delivery and one settlement beats
three. It stops at a filled basket rather than placing the order: committing a
business's money before they have seen the total is not automation.

### Brand

`src/app/globals.css` holds the token system: AfriMesh Green, Deep Emerald,
Dark Charcoal, Warm Sand, Slate and Light Gray; Inter for UI and IBM Plex Sans
for technical surfaces; rounded, flat, minimal-detail shapes. The logo is
rebuilt as vector in `components/brand/Logo.tsx` so it stays crisp at any size
and draws its colours from the tokens — respecting the guide's rules by
construction (fixed proportions, no shadows, no outlines, 32 px minimum).

Accessibility per the guide: visible keyboard focus everywhere, large touch
targets, semantic tables with captions, `prefers-reduced-motion` honoured, and
wide content scrolling inside its own container rather than the page.

---

## What the verification caught

`npm run verify` runs 42 checks against the real services. Four genuine defects
surfaced during the build, all now fixed:

1. **Every payment failed.** `markPayment` used `$2` in two different type
   contexts in one statement; PostgreSQL cannot deduce a parameter type from
   `status = $2` and `$2 = 'pending'` simultaneously (`text versus
   payment_status`). Found because the seed refused to complete.
2. **Refunds deadlocked.** `cancelOrder` runs in a transaction and called
   `returnStock`, which opened its own — a guaranteed hang on a
   single-connection driver. Any refund of a paid order would have frozen.
3. **The partner dashboard 500'd.** `unmetDemand` accepted an organisation id
   and never used it, leaving `$1` untyped. Fixed by making the query do what
   its name promises — scope demand to searches within reach of that business.
4. **Delivery fees were unpayable.** The fee went straight into the seller's
   escrow at payment time, so once delivery partners existed there was no pot
   to pay them from. Surfaced by building the rider flow against the ledger
   rather than around it.

The `/partner` overview is worth calling out: because unmet demand is now
geo-scoped, a shop sees what people *near them* searched for and could not
find. That is the procurement signal the inventory document asks for.

---

## Deliberately not built

Scope was held to the PRD's own MVP definition and its "Out of Scope (MVP)"
list. Deferred, with the seams left in place:

- **AI recommendations, demand forecasting, dynamic pricing** — Phase 3. The
  event log and demand tables are collecting the training data now.
- **Elasticsearch / OpenSearch** — PostgreSQL full-text plus barcode and
  substring matching covers launch volumes inside the latency budget. The
  search predicate is isolated in one function.
- **Kafka / RabbitMQ** — the in-process bus writes durably to `event_log`.
- **Graph database, cross-border commerce, API marketplace** — Phase 3.
- **Flutter mobile apps** — the web app is mobile-first and responsive.
- **Voice and image search** — the PRD marks both future.
- **Split payments, scheduled payments** — PRD marks both future.
- **Live rider tracking on a map, and true multi-stop route optimisation** —
  jobs are ranked by pickup proximity and tracked through their states, but
  there is no map view and no multi-drop batching.
- **Credit, lending and insurance** — the infographic's financial-partner
  bullets; BRS Phase 4.

Two things are simulated rather than integrated, because no credentials exist:
payments run through the mock gateway, and notifications print to the console
while being stored and marked delivered exactly as a real transport would.

---

## Environment

Copy `.env.example` to `.env`. Every value has a working default; the file
documents what each one switches on.

The one you should change before any real deployment is `AUTH_SECRET`. Two
commercial levers worth knowing about: `RIDER_SHARE_BPS` (the delivery
partner's cut of each delivery fee) and `CASHBACK_BPS` (buyer rewards, capped
at `PLATFORM_FEE_BPS`).

**Schema changes currently require `npm run db:reset`,** which drops everything
and reseeds. That is fine while the data is generated, but a migration runner
is the next piece of infrastructure this needs before anyone relies on the
data in it.

Sessions are opaque random tokens stored hashed — a stolen database dump cannot
be replayed into a live session, and revocation is immediate. Passwords use
scrypt. Server actions re-resolve the caller's identity and organisation on
every call rather than trusting a form field, because a server action is a
public HTTP endpoint.
