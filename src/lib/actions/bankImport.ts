"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseStatementCsv, statementRowExternalId } from "@/lib/bank-feed/csv-import";
import { categorizeText } from "@/lib/ai/categorize";
import { revalidatePath } from "next/cache";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Not authenticated");
  return session;
}

export type ImportSummary = {
  imported: number;
  duplicates: number;
  skippedRows: number;
  uncategorized: number;
};

/**
 * Imports a bank-exported CSV statement for one account. Every bank names
 * its export columns differently, so parseStatementCsv() matches on common
 * aliases rather than one fixed layout — see that file if a particular
 * bank's export isn't recognized.
 */
export async function importStatementCsv(accountId: string, file: File): Promise<ImportSummary> {
  const session = await requireSession();
  const userId = (session.user as any)?.id ?? null;

  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  const text = await file.text();
  const { rows, skipped } = parseStatementCsv(text);

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

    let bucketId: string | null = null;
    let confidence: number | null = null;
    let isMicro = false;
    try {
      const result = await categorizeText(`${row.description} $${row.amount.toFixed(2)}`);
      bucketId = result.bucketId;
      confidence = result.confidence;
      isMicro = result.isMicro;
    } catch {
      // No ANTHROPIC_API_KEY, or categorization failed — still import the
      // transaction, just uncategorized (fixable from the Transactions
      // page's "Move" control).
    }
    if (!bucketId) uncategorized++;

    await prisma.transaction.create({
      data: {
        amount: row.amount,
        currency: account.currency,
        merchant: row.description,
        occurredAt: row.occurredAt,
        source: "IMPORT",
        isMicro,
        aiConfidence: confidence,
        bucketId,
        accountId,
        externalId,
        userId,
      },
    });
    imported++;
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/insights");

  return { imported, duplicates, skippedRows: skipped, uncategorized };
}
