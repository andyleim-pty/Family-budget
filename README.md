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

The app runs and is fully usable from the web UI with none of the AI/WhatsApp keys set —
those three integrations degrade gracefully (Settings page shows what's configured).

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

## Project layout

```
prisma/schema.prisma        Data model (Users, Accounts, Buckets, Pockets, Transactions, InboundMessage)
prisma/seed.ts               Creates the two family logins + starter buckets/pockets
src/lib/budget.ts            Spend-vs-budget calculations + the suggestion copy
src/lib/enums.ts             String-enum values (SQLite doesn't support native Prisma enums)
src/lib/ai/categorize.ts     Claude-based extraction + bucket matching (photo or text)
src/lib/ai/transcribe.ts     Whisper voice-note transcription
src/lib/whatsapp/client.ts   WhatsApp Cloud API send + media download
src/lib/whatsapp/ingest.ts   The end-to-end pipeline: message → AI → transaction → reply
src/lib/actions/*.ts         Server actions backing the web UI's forms
src/lib/bank-feed/README.md  Where a live bank-feed sync (Basiq/Plaid) would plug in later
src/app/*                    Pages: dashboard, buckets, pockets, accounts, transactions, settings
src/app/api/whatsapp/webhook Inbound WhatsApp webhook (GET verify, POST messages)
```

## Notes on what's intentionally out of scope (v1)

- **Live bank-feed sync** (auto-importing every transaction from your actual bank) needs a
  provider like Basiq or Plaid, real credentials, and a consent flow only you can set up — see
  `src/lib/bank-feed/README.md` for the integration point the data model already supports.
  Balances are entered manually for now.
- **Multi-currency conversion** — each transaction/account carries a currency code, but no FX
  conversion is applied in totals; keep everything in one currency unless you extend this.
