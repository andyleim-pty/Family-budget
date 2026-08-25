import { POCKET_GOAL_LABELS, type PocketGoalType } from "@/lib/enums";

type Pocket = {
  id: string;
  name: string;
  goalType: string;
  currentAmount: number;
  targetAmount: number | null;
  targetDate: Date | null;
  monthlyContribution: number;
  percentToGoal: number | null;
};

const goalEmoji: Record<PocketGoalType, string> = {
  HOLIDAY: "🏖️",
  FESTIVITY: "🎉",
  TRIP: "✈️",
  EMERGENCY: "🛟",
  OTHER: "💰",
};

export default function PocketCard({ pocket }: { pocket: Pocket }) {
  const kind = pocket.goalType as PocketGoalType;
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-900">
          {goalEmoji[kind] ?? "💰"} {pocket.name}
        </p>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {POCKET_GOAL_LABELS[kind] ?? kind}
        </span>
      </div>
      <div className="mt-3 flex items-baseline justify-between text-sm">
        <span className="font-semibold">${pocket.currentAmount.toFixed(0)}</span>
        {pocket.targetAmount && <span className="text-gray-400">of ${pocket.targetAmount.toFixed(0)}</span>}
      </div>
      {pocket.percentToGoal !== null && (
        <div className="progress-track mt-1.5">
          <div className="progress-fill" style={{ width: `${pocket.percentToGoal}%`, background: "#16a355" }} />
        </div>
      )}
      <p className="text-xs text-gray-500 mt-2">
        {pocket.monthlyContribution > 0
          ? `Auto-saving $${pocket.monthlyContribution.toFixed(0)}/mo`
          : "No recurring contribution set"}
        {pocket.targetDate ? ` · target ${new Date(pocket.targetDate).toLocaleDateString()}` : ""}
      </p>
    </div>
  );
}
