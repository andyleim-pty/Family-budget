# Family Budget

A budget tracker built for two people (a household, not a company): monthly budget "buckets",
savings "pockets" for things that are irregular-but-predictable (holidays, festivities, trips, an
emergency fund), multiple bank accounts, and an AI-powered WhatsApp inbox — send a receipt photo
or a voice note and it's categorized, deducted from the right budget, and answered with a quick
budget-status reply.

## What it does

- **Buckets** — recurring monthly envelopes (Groceries, Dining, Utilities, …) each with a monthly
  limit and a dedicated **MICRO** kind for the small everyday purchases that quietly add up
  (coffees, snacks, parking). The dashboard tracks spend-vs-budget *and* spend-vs-time-elapsed, so
  a bucket that's 80% spent on day 10 of the month gets flagged even though it's technically still
  "under budget".
- **Savings pockets** — sinking funds for holidays, festivities, trips, and an emergency fund.
  These accumulate over time (not reset monthly) toward an optional target amount/date, with a
  suggested monthly contribution.
- **Accounts** — model as many real bank/cash accounts as you have; each bucket and pocket draws
  from one.
- **WhatsApp ingestion** — send a photo of a receipt, a voice note describing a purchase, or just
  type it ("$8.50 coffee"). The pipeline:
  1. Downloads the photo/audio from WhatsApp.
  2. Transcribes audio (OpenAI Whisper).
  3. Sends the photo or text to Claude to extract amount/merchant/date and pick the best-matching
     bucket from your actual bucket list.
  4. If confident, posts the transaction immediately and replies with the bucket's remaining
     budget and a one-line suggestion ("Dining is at 92% used with 12 days left in the month…").
  5. If unsure, replies asking which bucket it belongs to (reply with a number); a later
     `"fix <bucket name>"` reply re-files an already-logged transaction.
- Everything the AI does is also available as a plain web UI (manual transaction entry,
  bucket/pocket/account management) so this never depends on WhatsApp working.
- **Insights** — daily (30-day trend), weekly (this week vs. last), monthly (pace-based
  projection per bucket), quarterly, and annual statistics, plus two things a plain "spent so
  far" total won't catch: an **anomaly detector** that flags a transaction as unusually large
  *for that bucket's own history* (not a fixed dollar cutoff), and a **cash-flow projection**
  per account that warns before it actually goes negative. A **re-evaluation** pass compares the
  last 3 months of real spend to each bucket's limit and suggests raising or lowering it.
- **Proactive digests** — the same analytics pushed to WhatsApp on a schedule (not just shown when
  someone opens the dashboard): a daily summary of yesterday's spend + anything unusual, and a
  weekly this-week-vs-last-week summary + which buckets are on track to go over.
- **Budget assistant chat** — a running conversation (web page, or WhatsApp) that reasons about a
  *specific* purchase using your real numbers: does the bucket have room, and if not, which other
  bucket or savings pocket would effectively fund the difference this month. For small
  discretionary spend it can suggest a cheaper alternative or waiting; for a kid's purchase it can
  gently offer a reframe (save toward something bigger, contribute to tzedakah/charity, invest it
  instead) as one option among others — never as a lecture. On WhatsApp, a question ("should I get
  a coffee?") is routed here automatically instead of being logged as an expense; a statement
  ("$5 coffee") is still logged as before.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind, Prisma + SQLite (swap to Postgres for
production by changing one line), NextAuth credentials auth, Anthropic Claude for
categorization/vision, OpenAI Whisper for voice transcription, WhatsApp Cloud API for messaging.

## Getting started

```bash
npm install
cp .env.example .env       # then fill in the values below
npx prisma migrate dev     # creates dev.db and applies the schema
npm run db:seed            # creates your two logins + starter buckets/pockets
npm run dev
```

Open http://localhost:3000 and sign in with the `OWNER_EMAIL` / `OWNER_PASSWORD` you set in
`.env` — **change that password** (there's no self-service reset flow yet; re-run
`npm run db:seed` after editing `.env` to update it, since it upserts by email).

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | `file:./dev.db` for SQLite (default). Point at Postgres for production and change `provider` in `prisma/schema.prisma`. |
| `NEXTAUTH_SECRET` | yes | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | yes | Your app's base URL |
| `OWNER_*` / `PARTNER_*` | yes (for seeding) | The two family logins + WhatsApp numbers, in `.env` before running `npm run db:seed` |
| `ANTHROPIC_API_KEY` | for AI categorization | Powers receipt-photo and text expense extraction |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-5` |
| `OPENAI_API_KEY` | for voice notes | Whisper transcription; without it, voice notes get a friendly fallback reply asking for text/photo instead |
| `WHATSAPP_VERIFY_TOKEN` | for WhatsApp | Any random string you choose; used in the webhook handshake |
| `WHATSAPP_ACCESS_TOKEN` | for WhatsApp | From the Meta App Dashboard |
| `WHATSAPP_PHONE_NUMBER_ID` | for WhatsApp | From the Meta App Dashboard |
| `CRON_SECRET` | for proactive digests | Any random string; see "Proactive digests" below |

The app runs and is fully usable from the web UI with none of the AI/WhatsApp keys set —
those three integrations degrade gracefully (Settings page shows what's configured). The
assistant chat and the WhatsApp expense pipeline share the same `ANTHROPIC_API_KEY`.

## WhatsApp setup

This uses Meta's official **WhatsApp Cloud API** (free tier covers a household's message volume).

1. Create a Meta developer app at https://developers.facebook.com/apps, add the **WhatsApp**
   product.
2. In the WhatsApp product's **API Setup** page, note the **temporary access token** (or generate
   a permanent one via a System User for production) and the **Phone number ID** — set these as
   `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`.
3. Deploy this app somewhere with a public HTTPS URL (Vercel is the path of least resistance for
   Next.js).
4. In **Configuration → Webhook**, set the callback URL to
   `https://<your-domain>/api/whatsapp/webhook` and the verify token to whatever you put in
   `WHATSAPP_VERIFY_TOKEN`. Subscribe to the `messages` webhook field.
5. Add your and your partner's phone numbers as test recipients (required while the Meta app is
   in development mode), matching `OWNER_WHATSAPP_PHONE` / `PARTNER_WHATSAPP_PHONE` in `.env`
   (E.164 format, e.g. `+61412345678`) so incoming messages are attributed to the right person.
6. Message the WhatsApp test number with a receipt photo, a voice note, or plain text like
   `"$12 coffee"` and watch it show up under Transactions.

Note: Meta's dev-mode test numbers can only message a short allow-list of recipients, and tokens
from API Setup expire in 24h — moving to a permanent System User token is the main thing to do
before relying on this day-to-day.

## Proactive digests

`/api/cron/daily-digest` and `/api/cron/weekly-digest` compute the digest and WhatsApp it to
every family member with a phone number linked — but nothing calls them on its own; something has
to hit the URL on a schedule.

- **On Vercel:** `vercel.json` already declares both crons (daily at 21:00 UTC, weekly Monday
  21:00 UTC — edit the `schedule` cron expressions for your timezone). Set `CRON_SECRET` as an
  environment variable in the Vercel project; Vercel automatically sends it as
  `Authorization: Bearer $CRON_SECRET` when it triggers a cron, which is exactly what these routes
  check for.
- **Anywhere else:** point any scheduler (cron-job.org, a GitHub Actions scheduled workflow, your
  own server's crontab + `curl`) at `https://<your-domain>/api/cron/daily-digest` with header
  `Authorization: Bearer <CRON_SECRET>`, once a day and once a week respectively.

Without `CRON_SECRET` set, both routes return 401 and send nothing — they never fire from a bare
page load.

## Project layout

```
prisma/schema.prisma        Data model (Users, Accounts, Buckets, Pockets, Transactions, InboundMessage, Conversation/ChatMessage)
prisma/seed.ts               Creates the two family logins + starter buckets/pockets
src/lib/budget.ts            Spend-vs-budget calculations, suggestion copy, assessExpenseImpact (the chat's cross-bucket math)
src/lib/analytics.ts         Daily/weekly/monthly/quarterly/annual stats, anomaly detection, cash-flow projection, reallocation suggestions
src/lib/digest.ts            Builds the WhatsApp digest text from src/lib/analytics.ts
src/lib/enums.ts             String-enum values (SQLite doesn't support native Prisma enums)
src/lib/ai/categorize.ts     Claude-based extraction + bucket matching (photo or text) + expense-vs-question intent classification
src/lib/ai/transcribe.ts     Whisper voice-note transcription
src/lib/ai/assistant.ts      The chat assistant's tool-use loop (shared by the web chat and WhatsApp)
src/lib/conversations.ts     Conversation/ChatMessage persistence (per WhatsApp number or per web user)
src/lib/whatsapp/client.ts   WhatsApp Cloud API send + media download
src/lib/whatsapp/ingest.ts   The end-to-end pipeline: message → AI → transaction or assistant reply
src/lib/actions/*.ts         Server actions backing the web UI's forms and the assistant chat page
src/lib/bank-feed/csv-import.ts  CSV statement parsing + de-dupe hash (any bank, any country)
src/lib/actions/bankImport.ts   Server action: parse → categorize → insert as Transaction
src/lib/bank-feed/README.md  What's implemented today + exactly how a live feed (Plaid, etc.) would plug in later
src/app/*                    Pages: dashboard, insights, assistant, buckets, pockets, accounts, transactions, settings
src/app/api/whatsapp/webhook Inbound WhatsApp webhook (GET verify, POST messages)
src/app/api/cron/*           Bearer-token-guarded routes that trigger the daily/weekly digest send
```

## Bank statement import

The Transactions page has a **CSV import** card: export a statement from your bank's website and
drop it in against one of your accounts. It recognizes common column-name variants (`Date`,
`Description`/`Memo`/`Payee`, `Amount` or separate `Debit`/`Credit`) rather than needing one exact
format, categorizes each row with the same AI matcher the WhatsApp pipeline uses, and skips rows
you've already imported if a date range overlaps a previous upload. This works for any bank in any
country — it's the practical option when a live feed isn't available (see below).

## Notes on what's intentionally out of scope (v1)

- **Live/automatic bank-feed sync** (a transaction shows up the moment it posts, no CSV needed)
  needs a regulated open-banking aggregator in between (Plaid for US/Canada, Basiq/Frollo for
  Australia, TrueLayer/Yapily for UK/EU, Belvo for Mexico/Colombia/Brazil) plus real credentials
  and a consent flow only you can complete — not something buildable without your own account
  there. **Panama has no such aggregator today** (checked Belvo's coverage directly — Mexico,
  Colombia, Brazil only), so CSV import is the realistic path for a Panamanian account for the
  foreseeable future, not just a stopgap. See `src/lib/bank-feed/README.md` for exactly how a live
  feed (e.g. Plaid, for the US side) would plug into what's already built — it's additive, not a
  redesign.
- **Multi-currency conversion** — each transaction/account carries a currency code, but no FX
  conversion is applied in totals; keep everything in one currency unless you extend this.
