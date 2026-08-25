import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, getDaysInMonth, getDate } from "date-fns";

export type BucketStatus = {
  bucketId: string;
  name: string;
  kind: string;
  color: string;
  icon: string;
  monthlyLimit: number;
  spent: number;
  remaining: number;
  percentUsed: number; // 0-100+
  percentOfMonthElapsed: number; // 0-100
  pace: "on-track" | "at-risk" | "over-budget";
  microSpend: number;
  microCount: number;
};

/** Spend-vs-budget for every active bucket for the given month (defaults to now). */
export async function getBucketStatuses(reference: Date = new Date()): Promise<BucketStatus[]> {
  const from = startOfMonth(reference);
  const to = endOfMonth(reference);
  const daysInMonth = getDaysInMonth(reference);
  const dayOfMonth = getDate(reference);
  const percentOfMonthElapsed = Math.min(100, Math.round((dayOfMonth / daysInMonth) * 100));

  const buckets = await prisma.bucket.findMany({
    where: { archived: false },
    include: {
      transactions: {
        where: { occurredAt: { gte: from, lte: to } },
      },
    },
    orderBy: { name: "asc" },
  });

  return buckets.map((b) => {
    const spent = b.transactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const microTx = b.transactions.filter((t) => t.isMicro);
    const monthlyLimit = Number(b.monthlyLimit);
    const percentUsed = monthlyLimit > 0 ? Math.round((spent / monthlyLimit) * 100) : 0;

    let pace: BucketStatus["pace"] = "on-track";
    if (percentUsed >= 100) pace = "over-budget";
    else if (percentUsed > percentOfMonthElapsed + 15) pace = "at-risk";

    return {
      bucketId: b.id,
      name: b.name,
      kind: b.kind,
      color: b.color,
      icon: b.icon,
      monthlyLimit,
      spent,
      remaining: monthlyLimit - spent,
      percentUsed,
      percentOfMonthElapsed,
      pace,
      microSpend: microTx.reduce((sum, t) => sum + Number(t.amount), 0),
      microCount: microTx.length,
    };
  });
}

/** Household-wide summary used by the dashboard and by the WhatsApp quick-reply. */
export async function getHouseholdSummary(reference: Date = new Date()) {
  const buckets = await getBucketStatuses(reference);
  const totalBudget = buckets.reduce((s, b) => s + b.monthlyLimit, 0);
  const totalSpent = buckets.reduce((s, b) => s + b.spent, 0);
  const totalMicro = buckets.reduce((s, b) => s + b.microSpend, 0);
  const totalMicroCount = buckets.reduce((s, b) => s + b.microCount, 0);
  const overBudgetBuckets = buckets.filter((b) => b.pace === "over-budget");
  const atRiskBuckets = buckets.filter((b) => b.pace === "at-risk");

  const pockets = await prisma.pocket.findMany({ where: { archived: false } });
  const accounts = await prisma.account.findMany({ where: { archived: false } });

  return {
    buckets,
    totalBudget,
    totalSpent,
    totalRemaining: totalBudget - totalSpent,
    totalMicro,
    totalMicroCount,
    overBudgetBuckets,
    atRiskBuckets,
    pockets: pockets.map((p) => ({
      id: p.id,
      name: p.name,
      goalType: p.goalType,
      currentAmount: Number(p.currentAmount),
      targetAmount: p.targetAmount ? Number(p.targetAmount) : null,
      targetDate: p.targetDate,
      monthlyContribution: Number(p.monthlyContribution),
      percentToGoal:
        p.targetAmount && Number(p.targetAmount) > 0
          ? Math.min(100, Math.round((Number(p.currentAmount) / Number(p.targetAmount)) * 100))
          : null,
    })),
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      institution: a.institution,
      type: a.type,
      balance: Number(a.balance),
      currency: a.currency,
    })),
  };
}

/**
 * One or two short, specific sentences of feedback for a single bucket,
 * used both on the dashboard and in the WhatsApp confirmation reply.
 */
export function suggestionFor(status: BucketStatus): string {
  const remainingFmt = Math.abs(Math.round(status.remaining)).toLocaleString();
  if (status.pace === "over-budget") {
    return `${status.name} is $${remainingFmt} over budget for the month. Consider pausing non-essential spending here until next month.`;
  }
  if (status.pace === "at-risk") {
    return `${status.name} is at ${status.percentUsed}% used but the month is only ${status.percentOfMonthElapsed}% through — you're pacing ahead. $${remainingFmt} left.`;
  }
  if (status.percentUsed >= 80) {
    return `${status.name} is close to its limit ($${remainingFmt} left) — worth keeping an eye on for the rest of the month.`;
  }
  return `${status.name} is on track with $${remainingFmt} left.`;
}
