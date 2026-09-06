import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Nav from "@/components/Nav";

function ConfigRow({ label, ok, hint }: { label: string; ok: boolean; hint: string }) {
  return (
    <div className="flex items-start justify-between py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
      <span
        className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
          ok ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-500"
        }`}
      >
        {ok ? "Configured" : "Not set"}
      </span>
    </div>
  );
}

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div>
      <Nav userName={session?.user?.name ?? ""} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <h1 className="text-2xl font-bold">Settings</h1>

        <div className="card p-4">
          <h2 className="font-semibold mb-2">Family members</h2>
          <p className="text-xs text-gray-500 mb-3">
            Each person's WhatsApp number links their messages to their name in the transaction
            log. Edit these via the seed script (see README) or directly in the database.
          </p>
          <div className="divide-y divide-gray-100">
            {users.map((u) => (
              <div key={u.id} className="py-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </div>
                <span className="text-xs text-gray-500">{u.whatsappPhone ?? "no WhatsApp linked"}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold mb-2">Integration status</h2>
          <p className="text-xs text-gray-500 mb-3">
            Environment variables checked on this server. See README.md for how to set each one.
          </p>
          <div className="divide-y divide-gray-100">
            <ConfigRow
              label="Anthropic API (receipt photos & text categorization)"
              ok={!!process.env.ANTHROPIC_API_KEY}
              hint="ANTHROPIC_API_KEY"
            />
            <ConfigRow
              label="OpenAI Whisper (voice note transcription)"
              ok={!!process.env.OPENAI_API_KEY}
              hint="OPENAI_API_KEY — optional, voice notes get a friendly fallback message without it"
            />
            <ConfigRow
              label="WhatsApp Cloud API"
              ok={!!process.env.WHATSAPP_ACCESS_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID}
              hint="WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN"
            />
          </div>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold mb-2">Bank statements</h2>
          <p className="text-sm text-gray-600">
            Account balances are entered manually, and CSV statement import (Transactions page) is
            the current way to bulk-load spending from a bank that isn't wired up live. Automatic,
            always-on sync is a natural next step for US accounts specifically (via Plaid) — the
            data model and de-duplication already work the same way the CSV importer does, so it's
            mostly a new adapter, not a redesign. See{" "}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">src/lib/bank-feed/README.md</code>{" "}
            for exactly what that adapter would look like.
          </p>
        </div>
      </main>
    </div>
  );
}
