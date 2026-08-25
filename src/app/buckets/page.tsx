import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Nav from "@/components/Nav";
import { createBucket, archiveBucket } from "@/lib/actions/buckets";
import { BUCKET_KINDS, BUCKET_KIND_LABELS, type BucketKind } from "@/lib/enums";
import { getBucketStatuses } from "@/lib/budget";

export default async function BucketsPage() {
  const session = await getServerSession(authOptions);
  const accounts = await prisma.account.findMany({ where: { archived: false }, orderBy: { name: "asc" } });
  const statuses = await getBucketStatuses();

  return (
    <div>
      <Nav userName={session?.user?.name ?? ""} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <h1 className="text-2xl font-bold">Budget buckets</h1>
        <p className="text-sm text-gray-500 -mt-6">
          Buckets are your monthly envelopes — essentials, discretionary spend, and a dedicated
          "micro" bucket for the small everyday purchases that add up fast.
        </p>

        {accounts.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 card p-4 border-amber-200">
            Add a bank account first — every bucket needs one to fund it.
          </p>
        ) : (
          <div className="card p-4">
            <h2 className="font-semibold mb-3">Add bucket</h2>
            <form action={createBucket} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">Name</label>
                <input name="name" required className="input mt-1" placeholder="e.g. Groceries" />
              </div>
              <div>
                <label className="field-label">Kind</label>
                <select name="kind" className="input mt-1">
                  {BUCKET_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {BUCKET_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Monthly limit</label>
                <input name="monthlyLimit" type="number" step="0.01" required className="input mt-1" />
              </div>
              <div>
                <label className="field-label">Micro-expense threshold</label>
                <input name="microThreshold" type="number" step="0.01" defaultValue={15} className="input mt-1" />
              </div>
              <div>
                <label className="field-label">Funded from account</label>
                <select name="accountId" required className="input mt-1">
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Color</label>
                <input name="color" type="color" defaultValue="#22c56b" className="input mt-1 h-10" />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label">Description</label>
                <input name="description" className="input mt-1" placeholder="Optional notes for the AI categorizer" />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className="btn btn-primary">
                  Add bucket
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {statuses.map((s) => (
            <div key={s.bucketId} className="card p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: s.color }} />
                  {s.name}
                </p>
                <p className="text-xs text-gray-500">
                  {BUCKET_KIND_LABELS[s.kind as BucketKind] ?? s.kind} · ${s.spent.toFixed(0)} of $
                  {s.monthlyLimit.toFixed(0)} this month
                </p>
              </div>
              <form action={archiveBucket.bind(null, s.bucketId)}>
                <button className="btn btn-secondary text-xs" type="submit">
                  Archive
                </button>
              </form>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
