import type { BucketStatus } from "@/lib/budget";
import { suggestionFor } from "@/lib/budget";
import { BUCKET_KIND_LABELS, type BucketKind } from "@/lib/enums";

const paceStyles: Record<BucketStatus["pace"], { bar: string; badge: string; label: string }> = {
  "on-track": { bar: "#16a355", badge: "bg-brand-50 text-brand-700", label: "On track" },
  "at-risk": { bar: "#f59e0b", badge: "bg-amber-50 text-amber-700", label: "Ahead of pace" },
  "over-budget": { bar: "#dc2626", badge: "bg-red-50 text-red-700", label: "Over budget" },
};

export default function BucketCard({ status }: { status: BucketStatus }) {
  const pace = paceStyles[status.pace];
  const widthPct = Math.min(100, status.percentUsed);

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{status.name}</p>
          <p className="text-xs text-gray-500">{BUCKET_KIND_LABELS[status.kind as BucketKind] ?? status.kind}</p>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${pace.badge}`}>
          {pace.label}
        </span>
      </div>

      <div className="mt-3 flex items-baseline justify-between text-sm">
        <span className="font-semibold">${status.spent.toFixed(0)}</span>
        <span className="text-gray-400">of ${status.monthlyLimit.toFixed(0)}</span>
      </div>
      <div className="progress-track mt-1.5">
        <div
          className="progress-fill"
          style={{ width: `${widthPct}%`, background: pace.bar }}
        />
      </div>
      {/* Month-elapsed marker for pacing context */}
      <div className="relative h-0">
        <div
          className="absolute -top-3 w-px h-2 bg-gray-400"
          style={{ left: `${status.percentOfMonthElapsed}%` }}
          title={`${status.percentOfMonthElapsed}% of month elapsed`}
        />
      </div>

      {status.microCount > 0 && (
        <p className="text-xs text-gray-500 mt-2">
          {status.microCount} micro-expense{status.microCount === 1 ? "" : "s"} · $
          {status.microSpend.toFixed(0)}
        </p>
      )}

      <p className="text-xs text-gray-600 mt-2 leading-snug">{suggestionFor(status)}</p>
    </div>
  );
}
