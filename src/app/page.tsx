import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getHouseholdSummary } from "@/lib/budget";
import Nav from "@/components/Nav";
import BucketCard from "@/components/BucketCard";
import PocketCard from "@/components/PocketCard";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const summary = await getHouseholdSummary();

  return (
    <div>
      <Nav userName={session?.user?.name ?? ""} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        <section>
          <h1 className="text-2xl font-bold">This month</h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <StatTile label="Budgeted" value={`$${summary.totalBudget.toFixed(0)}`} />
            <StatTile label="Spent" value={`$${summary.totalSpent.toFixed(0)}`} />
            <StatTile
              label="Remaining"
              value={`$${summary.totalRemaining.toFixed(0)}`}
              tone={summary.totalRemaining < 0 ? "danger" : "default"}
            />
            <StatTile
              label="Micro-expenses"
              value={`$${summary.totalMicro.toFixed(0)}`}
              hint={`${summary.totalMicroCount} transaction${summary.totalMicroCount === 1 ? "" : "s"}`}
              tone="warn"
            />
          </div>

          {(summary.overBudgetBuckets.length > 0 || summary.atRiskBuckets.length > 0) && (
            <div className="mt-4 card p-4 border-amber-200 bg-amber-50">
              <p className="text-sm font-semibold text-amber-800">Heads up</p>
              <ul className="text-sm text-amber-800 mt-1 list-disc list-inside space-y-0.5">
                {summary.overBudgetBuckets.map((b) => (
                  <li key={b.bucketId}>{b.name} is over budget this month.</li>
                ))}
                {summary.atRiskBuckets.map((b) => (
                  <li key={b.bucketId}>{b.name} is spending faster than the month is passing.</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Budget buckets</h2>
            <Link href="/buckets" className="text-sm text-brand-700 font-medium">
              Manage buckets →
            </Link>
          </div>
          {summary.buckets.length === 0 ? (
            <EmptyState
              text="No budget buckets yet."
              cta="Create your first bucket"
              href="/buckets"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {summary.buckets.map((b) => (
                <BucketCard key={b.bucketId} status={b} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Savings pockets</h2>
            <Link href="/pockets" className="text-sm text-brand-700 font-medium">
              Manage pockets →
            </Link>
          </div>
          {summary.pockets.length === 0 ? (
            <EmptyState
              text="No savings pockets yet — great for holidays, festivities, trips, and an emergency fund."
              cta="Create a pocket"
              href="/pockets"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {summary.pockets.map((p) => (
                <PocketCard key={p.id} pocket={p} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Accounts</h2>
            <Link href="/accounts" className="text-sm text-brand-700 font-medium">
              Manage accounts →
            </Link>
          </div>
          {summary.accounts.length === 0 ? (
            <EmptyState text="No bank accounts linked yet." cta="Add an account" href="/accounts" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {summary.accounts.map((a) => (
                <div key={a.id} className="card p-4">
                  <p className="font-semibold">{a.name}</p>
                  <p className="text-xs text-gray-500">{a.institution ?? "—"} · {a.type}</p>
                  <p className="text-xl font-bold mt-2">
                    {new Intl.NumberFormat("en-AU", { style: "currency", currency: a.currency }).format(
                      a.balance
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger" | "warn";
}) {
  const toneClass =
    tone === "danger" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-gray-900";
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function EmptyState({ text, cta, href }: { text: string; cta: string; href: string }) {
  return (
    <div className="card p-6 mt-4 text-center">
      <p className="text-sm text-gray-500">{text}</p>
      <Link href={href} className="btn btn-primary mt-3 inline-flex">
        {cta}
      </Link>
    </div>
  );
}
