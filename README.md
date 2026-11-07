# Rare Mint — Chit Fund Finance & Digital Passbook PWA

Rare Mint supports chit organizers and subscribers with fixed-table and auction chit schedules, member tickets, collections, receipts, reminders and lift analysis.

Access is **invite-only** with three roles: **developer** (platform admin), **organizer** (chit owner) and **member** (subscriber). There is no public self-registration.

## Getting started

```bash
npm install
DEV_PHONE=9848012345 DEV_PIN=1357 DEV_NAME="Your Name" npm run dev
```

Open `http://localhost:3000` and sign in with the mobile number and PIN you were given.

### Developer environment variables

| Variable | Purpose |
| --- | --- |
| `DEV_PHONE` | 10-digit mobile number of the platform developer |
| `DEV_PIN` | 4-digit sign-in PIN of the platform developer |
| `DEV_NAME` | Display name of the platform developer |

On server start the developer account is **upserted** from these variables (created if missing, refreshed if present). If any variable is missing or invalid, the server logs a warning and creates no developer. The developer account can never be created from the UI or a public API.

### How the developer logs in

Sign in at the sign-in screen with `DEV_PHONE` / `DEV_PIN`. The **Platform Admin** dashboard shows read-only platform counts (owners, chits, members) and owner management. The developer cannot see chit financial details or member PINs.

### How owners are invited

1. The developer signs in and opens the Platform Admin dashboard.
2. **Invite Chit Owner** form: name, 10-digit mobile number, 4-digit PIN, city.
3. A confirmation shows the credentials — **share them privately** with the owner.
4. The owner signs in and creates chits, adds members (name, mobile, 4-digit PIN — share the PIN privately) and runs collections.

Owners can be edited (name/city), have their PIN reset, be deactivated/reactivated, and be deleted — deletion is blocked while the owner still has chit groups.

Members are created only by an organizer when adding a ticket to a chit (new subscriber, or picked from the organizer's own existing members). Organizers can later edit member details, reassign ticket numbers, reset member PINs and remove tickets that have no payments.

## Role permission matrix

| Capability | Developer | Organizer (owner) | Member |
| --- | --- | --- | --- |
| Sign in / sign out / session | ✔ | ✔ | ✔ |
| Invite / edit / deactivate / delete owners | ✔ | ✖ | ✖ |
| Platform counts (owners, chits, members) | ✔ | ✖ | ✖ |
| View chit financials | ✖ (counts only) | Own chits only | Own tickets only |
| Create / update / delete chits | ✖ | ✔ (own; delete only without payments, otherwise mark COMPLETED) | ✖ |
| Add / edit / remove tickets, reset member PINs | ✖ | ✔ (own chits; remove only without payments) | ✖ |
| Record / update payments (partial amounts allowed) | ✖ | ✔ (own chits) | ✖ |
| Void payments (reason required, audited) | ✖ | ✔ (own chits) | ✖ |
| Record lift / auction, set current month | ✖ | ✔ (own chits) | ✖ |
| Read dues, passbook, receipts | ✖ | Own chits | Own rows only |
| Self-registration | ✖ | ✖ | ✖ |

Every request is authorized from the **session token** (7-day expiry, stored server-side as a SHA-256 hash); client-supplied user IDs are ignored. PINs are hashed with scrypt (per-user salt, constant-time comparison) and never returned by any API. Logins are rate-limited: a phone is locked for 15 minutes after 5 failed attempts.

Update and delete operations on chits, tickets, payments and owner accounts are written to an `audit_log` table (actor, action, entity, before/after JSON, timestamp). Voided payments stay on record as `VOID` with their reason.

**Partial payments.** A member can pay a month in parts (server mode): each collection issues its own receipt, and the month stays due until the posted receipts add up to the installment. Dues and summaries show the remaining balance — `amountDue` is what is still owed and `amountPaid` what has come in. Recording or editing an amount above the outstanding balance is rejected, and a fully paid month is locked until a receipt is voided; voiding a receipt reopens the difference.

## Storage and existing installations

Locally, the app uses SQLite in `data/rare_mint.sqlite`. GitHub Pages uses a browser-local ledger instead; its data is not shared between devices or browsers. Use the JSON backup/restore controls in static mode to transfer it. A fresh database/browser starts empty. Demo records seeded by early builds (the sample organizer, its 20 sample members, the `RM-5L-16M` / `RM-2L-20M` chits and their tickets and payments) are removed automatically, once, from existing SQLite databases, browser ledgers and restored JSON backups. Saved demo sign-ins and cached demo responses are cleared too. Entries you created yourself are kept.

Existing SQLite databases are migrated automatically on startup (one-time): plaintext PINs are hashed, the `developer` role, `is_active`, `sessions`, `login_locks`, `audit_log` and payment `POSTED`/`VOID` status are added, and the one-payment-per-month unique index becomes a plain lookup index (partial payments).

### Static / GitHub Pages mode (demo only)

The static build on GitHub Pages has no server, so **invite-only features need the server**: no owner invites, no sessions, no shared ledger. Static self-registration is disabled by default; to run a local demo with the browser ledger, enable demo mode in the browser console:

```js
localStorage.setItem('rm_demo_mode', '1');   // gate for static-mode registration
location.reload();
```

With demo mode on, the local ledger accepts registration through the demo/test tooling (`localStore.register(...)`, enabled by the flag). You can also bring accounts over from a server install by exporting a JSON backup there and using **Export / Restore Ledger** in static mode — backups carry users along with the ledger. The browser ledger keeps the old one-payment-per-month rule; partial payments need the server. Do not use static mode for real financial data.

## Loading app updates

The app works offline, so a device can keep showing an older version after a new deploy. Tap **Hard Refresh App** (sidebar on desktop, ↻ icon in the top bar on mobile, or the link under the sign-in form). It removes Rare Mint's service worker and offline caches and reloads the latest build from the network. Your ledger, sign-in and backups are kept. The **Version** label under the button shows the build time (IST) of the version you are running.

## Development checks

```bash
npm run typecheck
npm test
npm run build
```

CI runs these checks on every push. Only `main` deploys to GitHub Pages.

## Architecture

- `server/repositories/*.ts` — data-access interfaces with SQLite implementations (`server/repositories/sqlite/*`). Routes and services never write SQL directly.
- `server/services/*` — business rules (validation, owner management, chit/ticket/payment/lift rules, audit writes).
- `server/auth/*` — `AuthProvider` interface (login/logout/resolve), scrypt password hashing, `requireAuth` / `requireRole` middleware.
- `src/utils/chitFinance.ts` — pure finance logic (payable amounts, schedules, auction lift math, receipt numbering) shared by routes, UI and tests.

## Supabase migration notes

The code is structured so SQLite can be swapped for Supabase (Postgres + Supabase Auth) without rewriting routes or UI:

1. **Repositories** implement the interfaces in `server/repositories/types.ts` (`UsersRepository`, `SessionsRepository`, `LoginLocksRepository`, `ChitsRepository`, `SlotsRepository`, `PaymentsRepository`, `AuditRepository`) with Postgres queries, and rewire `server/repositories/index.ts`. Multi-row writes must honor `runInTransaction` (map to a Postgres transaction/CTE).
2. **Auth** implements `AuthProvider` in `server/auth/types.ts` with Supabase Auth: `login` verifies the phone/PIN credential (or replace with OTP) and returns a Supabase session JWT; `resolve` validates the JWT and returns the `AuthUser`; `logout` revokes the session. Keep the `users` row in sync with `auth.users` (a trigger or upsert on first login), including `role` (`developer`/`organizer`/`member`) and `is_active`.
3. **Schema**: map `users`, `chit_groups`, `chit_schedules`, `member_slots`, `payments`, `audit_log` to Postgres tables. Use a plain index on `payments (member_slot_id, month_number)` (`payments_slot_month_idx` in v3 — the old one-POSTED-payment-per-month unique index was dropped when partial payments landed: a month closes when the sum of its POSTED receipts reaches the installment), and use a sequence for the receipt counter (`app_counters` today).
4. **Routes and UI are untouched**: they speak JSON over `/api` and only rely on `requireAuth`/`requireRole` plus the service layer. Row-level security policies should mirror the ownership rules in `server/services/ledgerService.ts` (organizer owns `organizer_id` rows; member reads only rows joined to `member_slots.user_id`).
5. **PIN handling**: if Supabase Auth owns credentials, drop `pin_hash`/`pin_salt` and the `reset-pin` endpoints in favor of Supabase password reset/OTP flows; the developer seeding logic moves to a Supabase admin script using the same env vars.

## Security limitations

This is a prototype, not a secure multi-user financial service. The server-side session flow (hashed PINs, session tokens, ownership checks, audit trail) is in place, but transport security, production secret management and backups are out of scope. Static-mode data is accessible to the browser. Do not use with sensitive or real financial data without transport security, appropriate backups and a security review.
