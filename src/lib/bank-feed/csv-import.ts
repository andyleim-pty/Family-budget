import crypto from "crypto";

export type StatementRow = {
  /** Positive = money out (an expense); negative = a refund/credit, skipped by the importer. */
  amount: number;
  description: string;
  occurredAt: Date;
};

const DATE_HEADERS = ["date", "transaction date", "posted date", "posting date"];
const DESCRIPTION_HEADERS = ["description", "memo", "payee", "merchant", "name", "details"];
const AMOUNT_HEADERS = ["amount", "transaction amount"];
const DEBIT_HEADERS = ["debit", "withdrawal", "money out", "amount debit"];
const CREDIT_HEADERS = ["credit", "deposit", "money in", "amount credit"];

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function findColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((h) => candidates.includes(h.toLowerCase().trim()));
}

function parseAmount(raw: string): number {
  // Strip currency symbols/thousands separators; treat parentheses as negative, e.g. "(45.00)".
  const negative = /^\(.*\)$/.test(raw.trim());
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  const value = Number(cleaned || 0);
  return negative ? -Math.abs(value) : value;
}

function parseDate(raw: string): Date {
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  // Common bank export format: MM/DD/YYYY.
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const [, m, d, y] = match;
    const year = y.length === 2 ? Number(`20${y}`) : Number(y);
    return new Date(year, Number(m) - 1, Number(d));
  }
  return new Date(NaN);
}

/**
 * Parses a bank-exported CSV statement. Column names vary a lot bank to
 * bank, so this matches on common aliases rather than requiring an exact
 * format — it recognizes a single "Amount" column, or separate
 * "Debit"/"Credit" columns, whichever the file has.
 */
export function parseStatementCsv(text: string): { rows: StatementRow[]; skipped: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], skipped: 0 };

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const dateCol = findColumn(headers, DATE_HEADERS);
  const descCol = findColumn(headers, DESCRIPTION_HEADERS);
  const amountCol = findColumn(headers, AMOUNT_HEADERS);
  const debitCol = findColumn(headers, DEBIT_HEADERS);
  const creditCol = findColumn(headers, CREDIT_HEADERS);

  if (dateCol === -1 || descCol === -1 || (amountCol === -1 && debitCol === -1 && creditCol === -1)) {
    throw new Error(
      "Couldn't find recognizable Date/Description/Amount columns. Expected headers like " +
        '"Date", "Description", and either "Amount" or "Debit"/"Credit".'
    );
  }

  type RawRow = { occurredAt: Date; description: string; signedAmount: number };
  const raw: RawRow[] = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const occurredAt = parseDate(cells[dateCol] ?? "");
    const description = (cells[descCol] ?? "").trim();
    if (Number.isNaN(occurredAt.getTime()) || !description) {
      skipped++;
      continue;
    }

    let signedAmount: number;
    if (amountCol !== -1) {
      signedAmount = parseAmount(cells[amountCol] ?? "0");
    } else {
      // A separate Debit/Credit layout is unambiguous regardless of sign
      // convention — debit is always money out, credit always money in.
      const debit = debitCol !== -1 ? parseAmount(cells[debitCol] ?? "0") : 0;
      const credit = creditCol !== -1 ? parseAmount(cells[creditCol] ?? "0") : 0;
      signedAmount = Math.abs(debit) - Math.abs(credit);
    }

    if (signedAmount === 0) {
      skipped++;
      continue;
    }
    raw.push({ occurredAt, description, signedAmount });
  }

  // A single "Amount" column has no fixed sign convention across banks —
  // some export debits as negative, others as positive. Rather than guess
  // one and silently drop real expenses, infer it per-file: whichever sign
  // is more common is treated as "money out", since a normal statement has
  // far more debits (coffee, groceries, ...) than credits (payroll,
  // refunds). A Debit/Credit layout has no such ambiguity, so it skips this.
  let expenseSign = 1;
  if (amountCol !== -1 && raw.length > 0) {
    const negativeCount = raw.filter((r) => r.signedAmount < 0).length;
    expenseSign = negativeCount * 2 > raw.length ? -1 : 1;
  }

  const rows: StatementRow[] = [];
  for (const r of raw) {
    const matchesExpenseSign = amountCol === -1 ? r.signedAmount > 0 : Math.sign(r.signedAmount) === expenseSign;
    if (!matchesExpenseSign) {
      // Opposite sign from the file's dominant convention — a deposit,
      // payroll, refund, or transfer in. Not a bucketed expense.
      skipped++;
      continue;
    }
    const amount = Math.abs(r.signedAmount);
    const { occurredAt, description } = r;

    rows.push({ amount, description, occurredAt });
  }

  return { rows, skipped };
}

/** Stable id for de-duplicating the same statement row across re-imports (e.g. an overlapping date range). */
export function statementRowExternalId(accountId: string, row: StatementRow): string {
  const key = `${accountId}|${row.occurredAt.toISOString().slice(0, 10)}|${row.amount.toFixed(2)}|${row.description}`;
  return crypto.createHash("sha256").update(key).digest("hex");
}
