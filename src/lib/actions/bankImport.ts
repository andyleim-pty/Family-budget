"use server";

import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/household";
import { parseStatementCsv, statementRowExternalId } from "@/lib/bank-feed/csv-import";
import { categorizeText } from "@/lib/ai/categorize";
import { revalidatePath } from "next/cache";

export type ImportSummary = {
  imported: number;
  duplicates: number;
  unreadableRows: number;
  nonExpenseRows: number;
  uncategorized: number;
};

/**
 * Imports a bank-exported CSV statement for one account. Every bank names
 * its export columns differently, so parseStatementCsv() matches on common
 * aliases rather than one fixed layout — see that file if a particular
 * bank's export isn't recognized.
 *
 * Takes a single FormData (fields "accountId" and "file") rather than
 * separate arguments — passing a bare File as one of several positional
 * server-action arguments isn't reliably serializable when the action is
 * invoked directly from client code (as opposed to a native <form action>);
 * FormData is the documented, supported way to send a file either way.
 */
export async function importStatementCsv(formData: FormData): Promise<ImportSummary> {
  const { userId, householdId } = await requireSessionUser();

  const accountId = String(formData.get("accountId") ?? "");
  const file = formData.get("file") as File | null;
  if (!accountId || !file) throw new Error("Account and file are required");

  const account = await prisma.account.findFirst({ where: { id: accountId, householdId } });
  if (!account) throw new Error("Account not found");
  const text = await file.text();
  const { rows, unreadable, nonExpense } = parseStatementCsv(text);

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
      const result = await categorizeText(householdId, `${row.description} $${row.amount.toFixed(2)}`);
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
        householdId,
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

  return { imported, duplicates, unreadableRows: unreadable, nonExpenseRows: nonExpense, uncategorized };
}
