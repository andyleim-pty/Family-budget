# Bank feed integration — current state and the future path

## What's implemented today: CSV statement import

`src/lib/bank-feed/csv-import.ts` (+ the server action in `src/lib/actions/bankImport.ts`, wired
into the Transactions page) parses a bank-exported CSV — matching common column-name aliases
(`Date`/`Transaction Date`, `Description`/`Memo`/`Payee`, `Amount` or separate `Debit`/`Credit`)
rather than requiring one exact layout — and, for each row:

1. Computes a stable id (`statementRowExternalId`: a hash of account + date + amount +
   description) so re-uploading an overlapping date range skips rows already imported.
2. Runs the row through the same `categorizeText()` used by the WhatsApp pipeline
   (`src/lib/ai/categorize.ts`) to pick a bucket.
3. Inserts it as a `Transaction` with `source: "IMPORT"`.

This works for **any** bank that lets you export a statement, regardless of country — which is
the reason it's the current answer for a bank with no live-feed provider (see below).

## Why there's no live/automatic feed yet

A real bank doesn't hand transaction data to a hobby app directly — that always goes through a
regulated "open banking" aggregator sitting in between, and coverage is region-specific:

- **US/Canada** → [Plaid](https://plaid.com) — the standard choice, has a free sandbox/dev tier.
- **UK/EU** → TrueLayer, Yapily, or GoCardless Bank Account Data (PSD2-regulated).
- **Australia** → Basiq or Frollo (Consumer Data Right-regulated).
- **Mexico/Colombia/Brazil** → [Belvo](https://belvo.com).
- **Panama, and most of the rest of Latin America** → no mainstream aggregator currently covers
  this (checked Belvo's docs directly — Mexico/Colombia/Brazil only, no Panama). CSV import above
  is the realistic path for a Panamanian account for the foreseeable future, not just a stopgap.

Wiring up a real provider also means *you* completing a signup + a per-bank OAuth-style consent
flow yourself (it's your identity/accounts being authorized) — not something that can be done on
your behalf.

## Adding a live feed later (e.g. Plaid for the US accounts)

The CSV importer above is deliberately the template to mirror — a live sync adapter reuses the
exact same three steps, just fetching rows from an API instead of a file:

1. **Schema**: add to `Account` — `provider` (`"MANUAL" | "PLAID"`, following the same
   string-enum pattern as the rest of the schema), `externalAccountId` (the provider's account
   id), and wherever the provider's access token is stored, encrypt it at rest (e.g. AES-256-GCM
   with a key from an env var — don't store it plain).
2. **Adapter**: `src/lib/bank-feed/plaid.ts` — `createLinkToken()`, `exchangePublicToken()`
   (Plaid Link's OAuth-ish flow returns an access token per bank login), and
   `syncAccountTransactions(account)`, which calls Plaid's `/transactions/sync` (cursor-based —
   store the cursor on `Account` so each sync only fetches what's new).
3. **De-dupe + categorize + insert**: for each fetched transaction, use the provider's own
   transaction id as `Transaction.externalId` (exactly like the CSV importer's content hash — same
   `@@unique([accountId, externalId])` constraint already in the schema does the work), run it
   through `categorizeText()`, insert with `source: "IMPORT"`. This part doesn't change at all
   from what's already built.
4. **Trigger**: either a provider webhook (Plaid can POST when new transactions are ready) hitting
   a new `src/app/api/plaid/webhook` route, or a scheduled sync using the same cron-secret pattern
   as `src/app/api/cron/daily-digest`.
5. **UI**: a "Connect a bank" button on the Accounts page using Plaid Link
   (`react-plaid-link`'s `usePlaidLink` hook) that calls a server action for the link token +
   exchange, instead of the CSV upload form.

None of the current schema or pipeline needs to change shape for this — it's an additive adapter,
which is exactly why CSV import was built as the first version rather than something narrower.
