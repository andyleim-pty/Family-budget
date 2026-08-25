# Live bank feed integration point (future work)

This app currently tracks account balances manually (`Account.balance`, updated via
`updateAccountBalance` in `src/lib/actions/accounts.ts`). Real bank-feed sync — e.g. via
[Basiq](https://basiq.io) (Australian banks) or [Plaid](https://plaid.com) — is a natural next
step and was designed for from day one:

- `Account` already models one row per real-world bank account.
- `Transaction.source` already has an `"IMPORT"` value for feed-originated rows, alongside the
  WhatsApp and manual sources.
- `Bucket.accountId` / `Pocket.accountId` mean a synced transaction only needs a merchant→bucket
  categorization step (the same `categorizeText` prompt in `src/lib/ai/categorize.ts` used for
  WhatsApp messages) before it can be inserted the same way `commitTransaction` does in
  `src/lib/whatsapp/ingest.ts`.

To add a provider:

1. Add an adapter here, e.g. `src/lib/bank-feed/basiq.ts`, exposing a function that returns
   normalized `{ accountExternalId, amount, merchant, postedAt }[]` for a given `Account`.
2. Store the provider's external account id on `Account` (add a `externalAccountId String?`
   column via `prisma migrate dev`).
3. Run the sync on a schedule (a cron job, or a Vercel Cron / Next.js Route Handler hit by an
   external scheduler) that fetches new transactions, feeds each through `categorizeText`, and
   creates a `Transaction` with `source: "IMPORT"` — mirroring `commitTransaction` in
   `src/lib/whatsapp/ingest.ts`.
4. Reconcile `Account.balance` from the provider's reported balance instead of the manual form.

This isn't implemented yet because it requires real provider credentials and a compliance/consent
flow (Consumer Data Right in Australia, or Plaid's Link flow) that only the account owner can set
up — but the data model and ingestion pipeline are ready for it.
