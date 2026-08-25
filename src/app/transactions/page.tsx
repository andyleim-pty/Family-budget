import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Nav from "@/components/Nav";
import { createManualTransaction, deleteTransaction, recategorizeTransaction } from "@/lib/actions/transactions";

const sourceLabels: Record<string, string> = {
  MANUAL: "Manual",
  WHATSAPP_IMAGE: "📷 WhatsApp",
  WHATSAPP_AUDIO: "🎙️ WhatsApp",
  WHATSAPP_TEXT: "💬 WhatsApp",
  IMPORT: "Import",
};

export default async function TransactionsPage() {
  const session = await getServerSession(authOptions);
  const buckets = await prisma.bucket.findMany({ where: { archived: false }, orderBy: { name: "asc" } });
  const transactions = await prisma.transaction.findMany({
    orderBy: { occurredAt: "desc" },
    take: 100,
    include: { bucket: true, loggedBy: true },
  });

  return (
    <div>
      <Nav userName={session?.user?.name ?? ""} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-sm text-gray-500 -mt-6">
          Most expenses arrive automatically from WhatsApp photos and voice notes. Use this form
          to add anything manually.
        </p>

        <div className="card p-4">
          <h2 className="font-semibold mb-3">Add manually</h2>
          <form action={createManualTransaction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Amount</label>
              <input name="amount" type="number" step="0.01" required className="input mt-1" />
            </div>
            <div>
              <label className="field-label">Bucket</label>
              <select name="bucketId" required className="input mt-1">
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Merchant</label>
              <input name="merchant" className="input mt-1" />
            </div>
            <div>
              <label className="field-label">Date</label>
              <input name="occurredAt" type="date" className="input mt-1" />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Note</label>
              <input name="note" className="input mt-1" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-primary">
                Add transaction
              </button>
            </div>
          </form>
        </div>

        <div className="card divide-y divide-gray-100">
          {transactions.length === 0 && (
            <p className="p-4 text-sm text-gray-500">No transactions yet.</p>
          )}
          {transactions.map((t) => (
            <div key={t.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {t.merchant || t.note || "Expense"}{" "}
                  <span className="text-xs font-normal text-gray-400">
                    {sourceLabels[t.source] ?? t.source}
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  {t.bucket?.name ?? "Uncategorized"} ·{" "}
                  {new Date(t.occurredAt).toLocaleDateString()}
                  {t.loggedBy ? ` · ${t.loggedBy.name}` : ""}
                  {t.isMicro ? " · micro" : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-semibold">
                  {new Intl.NumberFormat("en-AU", { style: "currency", currency: t.currency }).format(
                    Number(t.amount)
                  )}
                </span>
                <form action={recategorizeTransaction.bind(null, t.id)} className="flex items-center gap-1">
                  <select name="bucketId" defaultValue={t.bucketId ?? ""} className="input py-1 text-xs w-32">
                    <option value="" disabled>
                      Recategorize…
                    </option>
                    {buckets.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <button className="text-xs text-brand-700 hover:underline" type="submit">
                    Move
                  </button>
                </form>
                <form action={deleteTransaction.bind(null, t.id)}>
                  <button className="text-xs text-red-600 hover:underline" type="submit">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
