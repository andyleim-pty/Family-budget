import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Nav from "@/components/Nav";
import { BarChart, ComparisonBarChart } from "@/components/charts/BarChart";
import {
  getDailySeries,
  getWeeklyComparison,
  getMonthlyProjection,
  getQuarterlyStats,
  getAnnualStats,
  detectAnomalies,
  getCashFlowProjection,
  suggestReallocations,
} from "@/lib/analytics";
import { format, parseISO } from "date-fns";

function money(n: number) {
  return `$${Math.round(Math.abs(n)).toLocaleString()}`;
}

export default async function InsightsPage() {
  const session = await getServerSession(authOptions);

  const [daily, weekly, monthly, quarterly, annual, anomalies, cashFlow, reallocations] = await Promise.all([
    getDailySeries(30),
    getWeeklyComparison(),
    getMonthlyProjection(),
    getQuarterlyStats(),
    getAnnualStats(),
    detectAnomalies(),
    getCashFlowProjection(),
    suggestReallocations(),
  ]);

  const atRiskAccounts = cashFlow.filter((c) => c.atRisk);

  return (
    <div>
      <Nav userName={session?.user?.name ?? ""} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        <div>
          <h1 className="text-2xl font-bold">Insights</h1>
          <p className="text-sm text-gray-500">
            Daily, weekly, quarterly and annual spending, projections, and anything that looks
            larger than usual.
          </p>
        </div>

        {atRiskAccounts.length > 0 && (
          <section className="card p-4 border-red-200 bg-red-50">
            <p className="text-sm font-semibold text-red-800">Cash-flow warning</p>
            <ul className="text-sm text-red-800 mt-1 space-y-1">
              {atRiskAccounts.map((c) => (
                <li key={c.accountId}>
                  <strong>{c.accountName}</strong> is projected to end the month at{" "}
                  <strong>{money(c.projectedEndOfMonthBalance)} negative</strong> at the current pace
                  (balance {money(c.currentBalance)}, ~{money(c.projectedRemainingSpend)} more expected to
                  go out this month).
                </li>
              ))}
            </ul>
          </section>
        )}

        {anomalies.length > 0 && (
          <section className="card p-4 border-amber-200 bg-amber-50">
            <p className="text-sm font-semibold text-amber-800">Larger than usual, recently</p>
            <ul className="text-sm text-amber-800 mt-1 space-y-1">
              {anomalies.slice(0, 8).map((a) => (
                <li key={a.transactionId}>
                  <strong>{money(a.amount)}</strong> at {a.merchant} ({a.bucketName}) on{" "}
                  {format(a.occurredAt, "MMM d")} — {a.reason}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="text-lg font-bold mb-3">Daily — last 30 days</h2>
          <div className="card p-4">
            <BarChart
              data={daily.map((d) => ({ label: format(parseISO(d.date), "d"), value: d.total }))}
              labelEvery={5}
            />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">This week vs. last week</h2>
          <div className="card p-4">
            <div className="flex items-baseline gap-4 mb-3">
              <span className="text-2xl font-bold">{money(weekly.thisWeekTotal)}</span>
              {weekly.pctChange !== null && (
                <span className={`text-sm font-medium ${weekly.pctChange > 0 ? "text-red-600" : "text-brand-700"}`}>
                  {weekly.pctChange > 0 ? "↑" : "↓"} {Math.abs(weekly.pctChange)}% vs last week
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full inline-block bg-brand-600" /> This week
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full inline-block bg-gray-300" /> Last week
              </span>
            </div>
            {weekly.byBucket.length > 0 ? (
              <ComparisonBarChart
                data={weekly.byBucket.map((b) => ({ label: b.name, a: b.thisWeek, b: b.lastWeek }))}
              />
            ) : (
              <p className="text-sm text-gray-400">No transactions yet this week.</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">Monthly projection</h2>
          <p className="text-sm text-gray-500 -mt-2 mb-3">
            Where each bucket is headed if it keeps spending at its current daily pace.
            {new Date().getDate() <= 7 && (
              <> Early in the month these swing more with every purchase — treat them as a rough signal, not a forecast.</>
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {monthly.map((m) => (
              <div key={m.bucketId} className="card p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: m.color }} />
                    {m.name}
                  </p>
                  {m.projectedOverBy > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                      +{money(m.projectedOverBy)} over
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Spent {money(m.spentSoFar)} so far · projected {money(m.projectedTotal)} of{" "}
                  {money(m.monthlyLimit)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">
            Quarterly — {quarterly.label}
            {quarterly.pctChange !== null && (
              <span className={`ml-2 text-sm font-medium ${quarterly.pctChange > 0 ? "text-red-600" : "text-brand-700"}`}>
                {quarterly.pctChange > 0 ? "↑" : "↓"} {Math.abs(quarterly.pctChange)}% vs prior quarter
              </span>
            )}
          </h2>
          <div className="card p-4">
            <BarChart data={quarterly.months.map((m) => ({ label: m.month.split(" ")[0], value: m.total }))} />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">
            Annual — {annual.label}
            {annual.pctChange !== null && (
              <span className={`ml-2 text-sm font-medium ${annual.pctChange > 0 ? "text-red-600" : "text-brand-700"}`}>
                {annual.pctChange > 0 ? "↑" : "↓"} {Math.abs(annual.pctChange)}% vs last year
              </span>
            )}
          </h2>
          <div className="card p-4">
            <BarChart data={annual.months.map((m) => ({ label: m.month.split(" ")[0], value: m.total }))} />
          </div>
        </section>

        {reallocations.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-3">Worth re-evaluating</h2>
            <div className="space-y-2">
              {reallocations.map((r) => (
                <div key={r.bucketName} className="card p-4 text-sm">
                  {r.message}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
