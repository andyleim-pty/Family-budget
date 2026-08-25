import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Nav from "@/components/Nav";
import { createAccount, archiveAccount } from "@/lib/actions/accounts";
import { ACCOUNT_TYPES } from "@/lib/enums";

export default async function AccountsPage() {
  const session = await getServerSession(authOptions);
  const accounts = await prisma.account.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    include: { buckets: true, pockets: true },
  });

  return (
    <div>
      <Nav userName={session?.user?.name ?? ""} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <h1 className="text-2xl font-bold">Bank accounts</h1>
        <p className="text-sm text-gray-500 -mt-6">
          Add each account you use to fund buckets or savings pockets. Balances are tracked
          manually for now — see Settings for notes on connecting a live bank feed later.
        </p>

        <div className="card p-4">
          <h2 className="font-semibold mb-3">Add account</h2>
          <form action={createAccount} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Name</label>
              <input name="name" required className="input mt-1" placeholder="e.g. Joint everyday" />
            </div>
            <div>
              <label className="field-label">Institution</label>
              <input name="institution" className="input mt-1" placeholder="e.g. Commbank" />
            </div>
            <div>
              <label className="field-label">Type</label>
              <select name="type" className="input mt-1">
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Currency</label>
              <input name="currency" defaultValue="AUD" className="input mt-1" />
            </div>
            <div>
              <label className="field-label">Current balance</label>
              <input name="balance" type="number" step="0.01" defaultValue={0} className="input mt-1" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-primary">
                Add account
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-3">
          {accounts.map((a) => (
            <div key={a.id} className="card p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold">{a.name}</p>
                <p className="text-xs text-gray-500">
                  {a.institution ?? "—"} · {a.type} · {a.buckets.length} bucket
                  {a.buckets.length === 1 ? "" : "s"}, {a.pockets.length} pocket
                  {a.pockets.length === 1 ? "" : "s"} funded
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="font-bold">
                  {new Intl.NumberFormat("en-AU", { style: "currency", currency: a.currency }).format(
                    Number(a.balance)
                  )}
                </p>
                <form action={archiveAccount.bind(null, a.id)}>
                  <button className="btn btn-secondary text-xs" type="submit">
                    Archive
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
