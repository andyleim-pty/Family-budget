import { prisma } from "@/lib/prisma";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  subWeeks,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfQuarter,
  endOfQuarter,
  subQuarters,
  startOfYear,
  endOfYear,
  subYears,
  eachDayOfInterval,
  eachMonthOfInterval,
  differenceInCalendarDays,
  getDaysInMonth,
  format,
} from "date-fns";
import { getBucketStatuses } from "@/lib/budget";

type Period = { from: Date; to: Date };

async function spendInRange({ from, to }: Period) {
  return prisma.transaction.findMany({
    where: { occurredAt: { gte: from, lte: to } },
    include: { bucket: true },
    orderBy: { occurredAt: "asc" },
  });
}

/** Total spend for each of the last `days` calendar days — feeds the daily-trend chart. */
export async function getDailySeries(days = 30, reference: Date = new Date()) {
  const from = startOfDay(new Date(reference.getTime() - (days - 1) * 86400000));
  const to = endOfDay(reference);
  const txns = await spendInRange({ from, to });

  const byDay = new Map<string, number>();
  for (const day of eachDayOfInterval({ start: from, end: to })) {
    byDay.set(format(day, "yyyy-MM-dd"), 0);
  }
  for (const t of txns) {
    const key = format(t.occurredAt, "yyyy-MM-dd");
    byDay.set(key, (byDay.get(key) ?? 0) + Number(t.amount));
  }
  return Array.from(byDay.entries()).map(([date, total]) => ({ date, total }));
}

/** This week vs. last week, overall and per bucket — the weekly digest's core numbers. */
export async function getWeeklyComparison(reference: Date = new Date()) {
  const thisWeek = { from: startOfWeek(reference), to: endOfWeek(reference) };
  const lastWeek = {
    from: startOfWeek(subWeeks(reference, 1)),
    to: endOfWeek(subWeeks(reference, 1)),
  };

  const [thisTx, lastTx] = await Promise.all([spendInRange(thisWeek), spendInRange(lastWeek)]);

  const thisTotal = thisTx.reduce((s, t) => s + Number(t.amount), 0);
  const lastTotal = lastTx.reduce((s, t) => s + Number(t.amount), 0);

  const byBucketName = new Map<string, { thisWeek: number; lastWeek: number }>();
  for (const t of thisTx) {
    const name = t.bucket?.name ?? "Uncategorized";
    const row = byBucketName.get(name) ?? { thisWeek: 0, lastWeek: 0 };
    row.thisWeek += Number(t.amount);
    byBucketName.set(name, row);
  }
  for (const t of lastTx) {
    const name = t.bucket?.name ?? "Uncategorized";
    const row = byBucketName.get(name) ?? { thisWeek: 0, lastWeek: 0 };
    row.lastWeek += Number(t.amount);
    byBucketName.set(name, row);
  }

  return {
    thisWeekTotal: thisTotal,
    lastWeekTotal: lastTotal,
    pctChange: lastTotal > 0 ? Math.round(((thisTotal - lastTotal) / lastTotal) * 100) : null,
    byBucket: Array.from(byBucketName.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.thisWeek - a.thisWeek),
  };
}

/** Yesterday's spend — the daily digest's core number. */
export async function getDailySummary(reference: Date = new Date()) {
  const yesterday = new Date(reference.getTime() - 86400000);
  const range = { from: startOfDay(yesterday), to: endOfDay(yesterday) };
  const txns = await spendInRange(range);
  const total = txns.reduce((s, t) => s + Number(t.amount), 0);
  const byBucket = new Map<string, number>();
  for (const t of txns) {
    const name = t.bucket?.name ?? "Uncategorized";
    byBucket.set(name, (byBucket.get(name) ?? 0) + Number(t.amount));
  }
  return {
    date: yesterday,
    total,
    count: txns.length,
    topBuckets: Array.from(byBucket.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3),
  };
}

/** Projects each bucket's month-end total from its spend pace so far this month. */
export async function getMonthlyProjection(reference: Date = new Date()) {
  const statuses = await getBucketStatuses(reference);
  const daysInMonth = getDaysInMonth(reference);
  const dayOfMonth = Math.max(1, differenceInCalendarDays(reference, startOfMonth(reference)) + 1);

  return statuses.map((s) => {
    const dailyPace = s.spent / dayOfMonth;
    const projectedTotal = Math.round(dailyPace * daysInMonth * 100) / 100;
    return {
      bucketId: s.bucketId,
      name: s.name,
      color: s.color,
      monthlyLimit: s.monthlyLimit,
      spentSoFar: s.spent,
      projectedTotal,
      projectedOverBy: Math.max(0, projectedTotal - s.monthlyLimit),
    };
  });
}

async function periodStats(period: Period, reference: Date) {
  const txns = await spendInRange(period);
  const total = txns.reduce((s, t) => s + Number(t.amount), 0);
  const byBucket = new Map<string, { total: number; color: string }>();
  for (const t of txns) {
    const name = t.bucket?.name ?? "Uncategorized";
    const row = byBucket.get(name) ?? { total: 0, color: t.bucket?.color ?? "#9ca3af" };
    row.total += Number(t.amount);
    byBucket.set(name, row);
  }
  const months = eachMonthOfInterval({ start: period.from, end: period.to }).map((m) => {
    const monthTotal = txns
      .filter((t) => t.occurredAt >= startOfMonth(m) && t.occurredAt <= endOfMonth(m))
      .reduce((s, t) => s + Number(t.amount), 0);
    return { month: format(m, "MMM yyyy"), total: monthTotal };
  });
  return {
    total,
    months,
    byBucket: Array.from(byBucket.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total),
  };
}

/** Current quarter vs. the previous one. */
export async function getQuarterlyStats(reference: Date = new Date()) {
  const current = { from: startOfQuarter(reference), to: endOfQuarter(reference) };
  const previous = {
    from: startOfQuarter(subQuarters(reference, 1)),
    to: endOfQuarter(subQuarters(reference, 1)),
  };
  const [curr, prev] = await Promise.all([
    periodStats(current, reference),
    periodStats(previous, reference),
  ]);
  return {
    label: `Q${Math.floor(reference.getMonth() / 3) + 1} ${reference.getFullYear()}`,
    ...curr,
    previousTotal: prev.total,
    pctChange: prev.total > 0 ? Math.round(((curr.total - prev.total) / prev.total) * 100) : null,
  };
}

/** Current year vs. the previous one. */
export async function getAnnualStats(reference: Date = new Date()) {
  const current = { from: startOfYear(reference), to: endOfYear(reference) };
  const previous = { from: startOfYear(subYears(reference, 1)), to: endOfYear(subYears(reference, 1)) };
  const [curr, prev] = await Promise.all([
    periodStats(current, reference),
    periodStats(previous, reference),
  ]);
  return {
    label: `${reference.getFullYear()}`,
    ...curr,
    previousTotal: prev.total,
    pctChange: prev.total > 0 ? Math.round(((curr.total - prev.total) / prev.total) * 100) : null,
  };
}

export type Anomaly = {
  transactionId: string;
  merchant: string;
  bucketName: string;
  amount: number;
  occurredAt: Date;
  reason: string;
};

/**
 * Flags recent transactions that are unusually large for their bucket —
 * "a possible larger expenditure you didn't see coming" — by comparing them
 * to that bucket's historical mean + spread, not a fixed dollar cutoff.
 */
export async function detectAnomalies(
  { lookbackDays = 120, recentDays = 14 }: { lookbackDays?: number; recentDays?: number } = {},
  reference: Date = new Date()
): Promise<Anomaly[]> {
  const historyFrom = new Date(reference.getTime() - lookbackDays * 86400000);
  const recentFrom = new Date(reference.getTime() - recentDays * 86400000);

  const history = await prisma.transaction.findMany({
    where: { occurredAt: { gte: historyFrom, lt: recentFrom } },
    select: { amount: true, bucketId: true },
  });
  const recent = await prisma.transaction.findMany({
    where: { occurredAt: { gte: recentFrom, lte: reference } },
    include: { bucket: true },
  });

  const statsByBucket = new Map<string, { mean: number; stddev: number }>();
  const grouped = new Map<string, number[]>();
  for (const t of history) {
    if (!t.bucketId) continue;
    const arr = grouped.get(t.bucketId) ?? [];
    arr.push(Number(t.amount));
    grouped.set(t.bucketId, arr);
  }
  for (const [bucketId, amounts] of grouped) {
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
    statsByBucket.set(bucketId, { mean, stddev: Math.sqrt(variance) });
  }

  const anomalies: Anomaly[] = [];
  for (const t of recent) {
    if (!t.bucketId || !t.bucket) continue;
    const amount = Number(t.amount);
    const stats = statsByBucket.get(t.bucketId);
    if (!stats || Number.isNaN(stats.mean)) continue;

    const threshold = Math.max(stats.mean + 2 * stats.stddev, stats.mean * 2.5);
    if (stats.mean > 0 && amount > threshold && amount > 20) {
      anomalies.push({
        transactionId: t.id,
        merchant: t.merchant ?? t.bucket.name,
        bucketName: t.bucket.name,
        amount,
        occurredAt: t.occurredAt,
        reason: `${Math.round(amount / stats.mean)}x this bucket's typical transaction (~$${Math.round(stats.mean)})`,
      });
    }
  }
  return anomalies.sort((a, b) => b.amount - a.amount);
}

export type CashFlowProjection = {
  accountId: string;
  accountName: string;
  currentBalance: number;
  projectedRemainingSpend: number;
  projectedEndOfMonthBalance: number;
  atRisk: boolean;
};

/**
 * Projects each account's end-of-month balance from current balance minus
 * the still-to-come spend implied by every bucket's current pace — the
 * "are we about to go negative" check.
 */
export async function getCashFlowProjection(reference: Date = new Date()): Promise<CashFlowProjection[]> {
  const [accounts, projections] = await Promise.all([
    prisma.account.findMany({ where: { archived: false } }),
    getMonthlyProjection(reference),
  ]);
  const bucketAccountIds = await prisma.bucket.findMany({
    where: { archived: false },
    select: { id: true, accountId: true },
  });
  const accountIdByBucket = new Map(bucketAccountIds.map((b) => [b.id, b.accountId]));

  return accounts.map((a) => {
    const remainingSpend = projections
      .filter((p) => accountIdByBucket.get(p.bucketId) === a.id)
      .reduce((sum, p) => sum + Math.max(0, p.projectedTotal - p.spentSoFar), 0);
    const projectedBalance = Number(a.balance) - remainingSpend;
    return {
      accountId: a.id,
      accountName: a.name,
      currentBalance: Number(a.balance),
      projectedRemainingSpend: remainingSpend,
      projectedEndOfMonthBalance: projectedBalance,
      atRisk: projectedBalance < 0,
    };
  });
}

export type ReallocationSuggestion = {
  bucketName: string;
  monthlyLimit: number;
  avgSpend: number;
  monthsOver: number;
  direction: "raise" | "lower";
  message: string;
};

/**
 * Looks at the last 3 full calendar months per bucket and flags a
 * persistent mismatch between the limit and actual spend — the "keep
 * re-evaluating the budget" ask, done as an ongoing nudge rather than a
 * one-off setup step.
 */
export async function suggestReallocations(reference: Date = new Date()): Promise<ReallocationSuggestion[]> {
  const buckets = await prisma.bucket.findMany({ where: { archived: false } });
  const suggestions: ReallocationSuggestion[] = [];

  for (const bucket of buckets) {
    const monthlyTotals: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const monthRef = subMonths(reference, i);
      const range = { from: startOfMonth(monthRef), to: endOfMonth(monthRef) };
      const txns = await prisma.transaction.findMany({
        where: { bucketId: bucket.id, occurredAt: { gte: range.from, lte: range.to } },
        select: { amount: true },
      });
      monthlyTotals.push(txns.reduce((s, t) => s + Number(t.amount), 0));
    }
    if (monthlyTotals.length < 3) continue;
    // All-zero history almost always means the bucket (or the app) is too
    // new to have 3 real months of data yet — not evidence of chronic
    // underspend, so don't suggest reallocating it away.
    if (monthlyTotals.every((v) => v === 0)) continue;

    const limit = Number(bucket.monthlyLimit);
    const avg = monthlyTotals.reduce((s, v) => s + v, 0) / monthlyTotals.length;
    const monthsOver = monthlyTotals.filter((v) => v > limit).length;
    const monthsUnder = monthlyTotals.filter((v) => v < limit * 0.6).length;

    if (monthsOver >= 2 && avg > limit * 1.1) {
      suggestions.push({
        bucketName: bucket.name,
        monthlyLimit: limit,
        avgSpend: Math.round(avg),
        monthsOver,
        direction: "raise",
        message: `${bucket.name} has gone over budget ${monthsOver} of the last 3 months (avg $${Math.round(avg)} vs. a $${limit} limit). Consider raising the limit to match reality, or trimming spend here.`,
      });
    } else if (monthsUnder >= 3) {
      suggestions.push({
        bucketName: bucket.name,
        monthlyLimit: limit,
        avgSpend: Math.round(avg),
        monthsOver,
        direction: "lower",
        message: `${bucket.name} has consistently used well under its $${limit} limit (avg $${Math.round(avg)}). Consider lowering it and moving the difference into a savings pocket.`,
      });
    }
  }
  return suggestions;
}
