import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp/client";
import { getDailySummary, getWeeklyComparison, getMonthlyProjection, detectAnomalies, getCashFlowProjection } from "@/lib/analytics";

function money(n: number) {
  return `$${Math.round(Math.abs(n)).toLocaleString()}`;
}

/** The proactive daily push: yesterday's spend, anything unusual, and any cash-flow risk. */
export async function buildDailyDigest(reference: Date = new Date()): Promise<string> {
  const [summary, anomalies, cashFlow] = await Promise.all([
    getDailySummary(reference),
    detectAnomalies({ recentDays: 1 }, reference),
    getCashFlowProjection(reference),
  ]);

  const lines: string[] = [`📊 *Yesterday:* ${money(summary.total)} across ${summary.count} transaction${summary.count === 1 ? "" : "s"}.`];

  if (summary.topBuckets.length > 0) {
    lines.push(summary.topBuckets.map((b) => `• ${b.name}: ${money(b.total)}`).join("\n"));
  }
  if (anomalies.length > 0) {
    lines.push(
      `\n⚠️ Larger than usual: ${anomalies
        .map((a) => `${a.merchant} (${money(a.amount)}, ${a.reason})`)
        .join("; ")}`
    );
  }
  const atRisk = cashFlow.filter((c) => c.atRisk);
  if (atRisk.length > 0) {
    lines.push(
      `\n🚨 At this pace, ${atRisk
        .map((c) => `${c.accountName} projects to ${money(c.projectedEndOfMonthBalance)} negative by month-end`)
        .join("; ")}. Might be worth slowing down.`
    );
  }
  return lines.join("\n");
}

/** The proactive weekly push: this week vs last week, and month-end projections at risk. */
export async function buildWeeklyDigest(reference: Date = new Date()): Promise<string> {
  const [weekly, monthly] = await Promise.all([
    getWeeklyComparison(reference),
    getMonthlyProjection(reference),
  ]);

  const changeText =
    weekly.pctChange === null
      ? ""
      : weekly.pctChange > 0
        ? ` (up ${weekly.pctChange}% on last week)`
        : ` (down ${Math.abs(weekly.pctChange)}% on last week)`;

  const lines: string[] = [`📅 *This week:* ${money(weekly.thisWeekTotal)}${changeText}.`];

  const movers = weekly.byBucket.slice(0, 3);
  if (movers.length > 0) {
    lines.push(movers.map((b) => `• ${b.name}: ${money(b.thisWeek)}`).join("\n"));
  }

  const projectedOver = monthly.filter((m) => m.projectedOverBy > 0);
  if (projectedOver.length > 0) {
    lines.push(
      `\n📈 On track to go over this month: ${projectedOver
        .map((m) => `${m.name} (projected ${money(m.projectedTotal)} of ${money(m.monthlyLimit)})`)
        .join("; ")}.`
    );
  }
  return lines.join("\n");
}

/** Sends a digest to every family member who has a WhatsApp number linked. */
export async function sendDigestToFamily(text: string) {
  const users = await prisma.user.findMany({ where: { whatsappPhone: { not: null } } });
  const results = await Promise.allSettled(
    users.map((u) => sendWhatsAppText(u.whatsappPhone as string, text))
  );
  return { sentTo: users.length, failures: results.filter((r) => r.status === "rejected").length };
}
