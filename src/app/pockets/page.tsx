import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Nav from "@/components/Nav";
import { createPocket, contributeToPocket, archivePocket } from "@/lib/actions/pockets";
import { POCKET_GOAL_TYPES, POCKET_GOAL_LABELS, type PocketGoalType } from "@/lib/enums";

export default async function PocketsPage() {
  const session = await getServerSession(authOptions);
  const accounts = await prisma.account.findMany({ where: { archived: false }, orderBy: { name: "asc" } });
  const pockets = await prisma.pocket.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <Nav userName={session?.user?.name ?? ""} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <h1 className="text-2xl font-bold">Savings pockets</h1>
        <p className="text-sm text-gray-500 -mt-6">
          Sinking funds for the expenses that are irregular but predictable — holidays,
          festivities, trips, and an emergency fund — so they never blow up a monthly budget.
        </p>

        {accounts.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 card p-4 border-amber-200">
            Add a bank account first — every pocket needs one to save into.
          </p>
        ) : (
          <div className="card p-4">
            <h2 className="font-semibold mb-3">Add pocket</h2>
            <form action={createPocket} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">Name</label>
                <input name="name" required className="input mt-1" placeholder="e.g. Bali trip 2027" />
              </div>
              <div>
                <label className="field-label">Goal type</label>
                <select name="goalType" className="input mt-1">
                  {POCKET_GOAL_TYPES.map((g) => (
                    <option key={g} value={g}>
                      {POCKET_GOAL_LABELS[g]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Target amount</label>
                <input name="targetAmount" type="number" step="0.01" className="input mt-1" />
              </div>
              <div>
                <label className="field-label">Target date</label>
                <input name="targetDate" type="date" className="input mt-1" />
              </div>
              <div>
                <label className="field-label">Monthly contribution</label>
                <input name="monthlyContribution" type="number" step="0.01" defaultValue={0} className="input mt-1" />
              </div>
              <div>
                <label className="field-label">Saved into account</label>
                <select name="accountId" required className="input mt-1">
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className="btn btn-primary">
                  Add pocket
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {pockets.map((p) => (
            <div key={p.id} className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">
                    {p.name}{" "}
                    <span className="text-xs font-normal text-gray-500">
                      ({POCKET_GOAL_LABELS[p.goalType as PocketGoalType] ?? p.goalType})
                    </span>
                  </p>
                  <p className="text-xs text-gray-500">
                    ${Number(p.currentAmount).toFixed(0)}
                    {p.targetAmount ? ` of $${Number(p.targetAmount).toFixed(0)}` : ""}
                  </p>
                </div>
                <form action={archivePocket.bind(null, p.id)}>
                  <button className="btn btn-secondary text-xs" type="submit">
                    Archive
                  </button>
                </form>
              </div>
              <form action={contributeToPocket} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="pocketId" value={p.id} />
                <div>
                  <label className="field-label">Add contribution</label>
                  <input name="amount" type="number" step="0.01" required className="input mt-1 w-32" />
                </div>
                <div>
                  <label className="field-label">Note</label>
                  <input name="note" className="input mt-1 w-48" placeholder="optional" />
                </div>
                <button type="submit" className="btn btn-primary">
                  Add
                </button>
              </form>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
