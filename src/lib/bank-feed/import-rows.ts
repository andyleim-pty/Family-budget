import { prisma } from "@/lib/prisma";
import { categorizeText } from "@/lib/ai/categorize";
import { statementRowExternalId, type StatementRow } from "@/lib/bank-feed/csv-import";

/** A statement row after bucket-matching, before it's written to the database. */
export type CategorizedRow = StatementRow & {
  bucketId: string | null;
  bucketName: string | null;
  confidence: number | null;
  isMicro: boolean;
};

export type ImportSummary = {
  imported: number;
  duplicates: number;
  uncategorized: number;
};

/**
 * Runs each row through the same bucket-matcher the WhatsApp pipeline uses.
 * Shared by every entry point that can produce a list of statement rows —
 * the web CSV importer, a WhatsApp document upload, and pasted statement
 * text in either chat — so bucket-matching behaves identically regardless
 * of how the rows arrived.
 */
export async function categorizeRows(householdId: string, rows: StatementRow[]): Promise<CategorizedRow[]> {
  const categorized: CategorizedRow[] = [];
  for (const row of rows) {
    let bucketId: string | null = null;
    let bucketName: string | null = null;
    let confidence: number | null = null;
    let isMicro = false;
    try {
      const result = await categorizeText(householdId, `${row.description} $${row.amount.toFixed(2)}`);
      bucketId = result.bucketId;
      bucketName = result.bucketName;
      confidence = result.confidence;
      isMicro = result.isMicro;
    } catch {
      // No ANTHROPIC_API_KEY, or categorization failed — the row still
      // gets imported uncategorized (fixable via "Move" on the
      // Transactions page) rather than dropped.
    }
    categorized.push({ ...row, bucketId, bucketName, confidence, isMicro });
  }
  return categorized;
}

/**
 * Writes already-categorized rows to one account as Transactions, deduping
 * against anything already imported (same account + date + amount +
 * description hash) so re-sending an overlapping statement is a no-op for
 * rows already there.
 */
export async function insertCategorizedRows(
  householdId: string,
  accountId: string,
  rows: CategorizedRow[],
  userId: string | null
): Promise<ImportSummary> {
  const account = await prisma.account.findFirst({ where: { id: accountId, householdId } });
  if (!account) throw new Error("Account not found");

  let imported = 0;
  let duplicates = 0;
  let uncategorized = 0;

  for (const row of rows) {
    const externalId = statementRowExternalId(accountId, row);
    const existing = await prisma.transaction.findFirst({ where: { accountId, externalId } });
    if (existing) {
      duplicates++;
      continue;
    }
    if (!row.bucketId) uncategorized++;

    await prisma.transaction.create({
      data: {
        householdId,
        amount: row.amount,
        currency: account.currency,
        merchant: row.description,
        occurredAt: row.occurredAt,
        source: "IMPORT",
        isMicro: row.isMicro,
        aiConfidence: row.confidence,
        bucketId: row.bucketId,
        accountId,
        externalId,
        userId,
      },
    });
    imported++;
  }

  return { imported, duplicates, uncategorized };
}

/** Groups categorized rows by bucket for a short human-readable preview ("mostly Dining, Groceries"). */
export function summarizeByBucket(rows: CategorizedRow[]): { name: string; total: number; count: number }[] {
  const byBucket = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const name = r.bucketName ?? "Uncategorized";
    const entry = byBucket.get(name) ?? { total: 0, count: 0 };
    entry.total += r.amount;
    entry.count += 1;
    byBucket.set(name, entry);
  }
  return Array.from(byBucket.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total);
}
