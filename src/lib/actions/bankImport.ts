"use server";

import { requireSessionUser } from "@/lib/household";
import { parseStatementCsv } from "@/lib/bank-feed/csv-import";
import { categorizeRows, insertCategorizedRows } from "@/lib/bank-feed/import-rows";
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

  const text = await file.text();
  const { rows, unreadable, nonExpense } = parseStatementCsv(text);
  const categorized = await categorizeRows(householdId, rows);
  const { imported, duplicates, uncategorized } = await insertCategorizedRows(
    householdId,
    accountId,
    categorized,
    userId
  );

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/insights");

  return { imported, duplicates, unreadableRows: unreadable, nonExpenseRows: nonExpense, uncategorized };
}
