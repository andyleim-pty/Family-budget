"use client";

import { useRef, useState } from "react";
import { importStatementCsv, type ImportSummary } from "@/lib/actions/bankImport";

export default function CsvImportForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file || !accountId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const summary = await importStatementCsv(accountId, file);
      setResult(summary);
      if (fileInput.current) fileInput.current.value = "";
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  if (accounts.length === 0) {
    return <p className="text-sm text-gray-400">Add an account first to import a statement into it.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Account</label>
          <select className="input mt-1" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">CSV statement</label>
          <input ref={fileInput} type="file" accept=".csv,text/csv" required className="input mt-1" />
        </div>
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Importing…" : "Import"}
      </button>

      {result && (
        <p className="text-sm text-brand-700 bg-brand-50 rounded-md px-3 py-2">
          Imported {result.imported} transaction{result.imported === 1 ? "" : "s"}
          {result.duplicates > 0 && ` · ${result.duplicates} already imported (skipped)`}
          {result.skippedRows > 0 && ` · ${result.skippedRows} row(s) couldn't be read`}
          {result.uncategorized > 0 && ` · ${result.uncategorized} need a bucket assigned manually`}
          .
        </p>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}
    </form>
  );
}
