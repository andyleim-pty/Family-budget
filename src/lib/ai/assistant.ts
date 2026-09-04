import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getHouseholdSummary, assessExpenseImpact, suggestionFor, getBucketStatuses } from "@/lib/budget";
import {
  getDailySummary,
  getWeeklyComparison,
  getMonthlyProjection,
  getQuarterlyStats,
  getAnnualStats,
} from "@/lib/analytics";
import type { ChatRole } from "@/lib/enums";

let _client: Anthropic | null = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const SYSTEM_PROMPT = `You are the family's budget advisor inside their household finance app. You
are having a real-time chat with one of the two adults in the household (they may ask before
spending, or after). You have tools that read the household's real bucket/pocket/account data and
spending history — always call a tool to get numbers; never guess or invent a dollar figure.

How to help:
- If they mention or ask about a purchase (real or hypothetical), call assess_expense_impact with
  the amount and the bucket it most likely belongs to (pick from the bucket list returned by
  get_budget_snapshot — match by name and description). Use the result to explain plainly: does
  the bucket have room, and if not, which other bucket or pocket would effectively end up funding
  the difference this month. Money is fungible within an account — be concrete about that
  trade-off ("that'd eat into your Dining budget instead") rather than just saying "over budget".
- When an expense is small/discretionary (coffee, snacks, an impulse buy) and the bucket is
  tight or over pace, offer one or two concrete, non-preachy alternatives: a cheaper version of
  the same thing, waiting a day, or pushing it to next week/month once the bucket resets. Keep it
  light and practical, not naggy — you're a helpful second opinion, not a scold.
- When the purchase is framed as being for a kid (a toy, a treat, something bought mostly for
  instant gratification), it's fine to gently offer the parent a reframe to consider raising with
  the kid — saving toward something they want more, contributing to tzedakah/charity, or letting
  the money grow if invested instead — as one option among others, never as the only acceptable
  answer, and never moralizing. Skip this entirely for anything that isn't a discretionary
  kid-purchase (never apply it to essentials or adult spending).
- For "how am I doing" / stats questions, call get_spending_stats with the right period
  (daily/weekly/monthly/quarterly/annual) and summarize the real numbers concisely.
- Only call log_transaction after the person clearly confirms they want it recorded (e.g. "yes",
  "log it", "go ahead") — never log something on your own initiative just because it was discussed.
- Keep replies short — a few sentences. This is read in a chat bubble or a WhatsApp message, not a
  report.`;

const tools: Anthropic.Tool[] = [
  {
    name: "get_budget_snapshot",
    description:
      "Current status of every budget bucket, savings pocket, and bank account — balances, spend-to-date, and pacing.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_spending_stats",
    description: "Spending statistics and projections for a given time period.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["daily", "weekly", "monthly", "quarterly", "annual"],
        },
      },
      required: ["period"],
    },
  },
  {
    name: "assess_expense_impact",
    description:
      "Computes what a real or hypothetical expense would do to its bucket's remaining budget this month, and — if it would overdraw the bucket — which other bucket or pocket on the same account has slack to effectively cover the difference.",
    input_schema: {
      type: "object",
      properties: {
        bucket_name: { type: "string", description: "Exact bucket name from get_budget_snapshot." },
        amount: { type: "number" },
      },
      required: ["bucket_name", "amount"],
    },
  },
  {
    name: "get_recent_transactions",
    description: "Recent transactions, optionally filtered by bucket name or merchant, for context on past spending.",
    input_schema: {
      type: "object",
      properties: {
        bucket_name: { type: "string" },
        merchant_contains: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "log_transaction",
    description: "Records a confirmed expense as a real transaction against a bucket. Only call after the person confirms.",
    input_schema: {
      type: "object",
      properties: {
        bucket_name: { type: "string" },
        amount: { type: "number" },
        merchant: { type: "string" },
        note: { type: "string" },
      },
      required: ["bucket_name", "amount"],
    },
  },
];

async function executeTool(name: string, input: any, userId: string | null): Promise<unknown> {
  switch (name) {
    case "get_budget_snapshot":
      return getHouseholdSummary();

    case "get_spending_stats": {
      switch (input.period) {
        case "daily":
          return getDailySummary();
        case "weekly":
          return getWeeklyComparison();
        case "monthly":
          return getMonthlyProjection();
        case "quarterly":
          return getQuarterlyStats();
        case "annual":
          return getAnnualStats();
        default:
          return { error: "unknown period" };
      }
    }

    case "assess_expense_impact":
      return assessExpenseImpact(String(input.bucket_name), Number(input.amount));

    case "get_recent_transactions": {
      const where: any = {};
      if (input.bucket_name) where.bucket = { name: { equals: input.bucket_name } };
      if (input.merchant_contains) where.merchant = { contains: input.merchant_contains };
      const txns = await prisma.transaction.findMany({
        where,
        include: { bucket: true },
        orderBy: { occurredAt: "desc" },
        take: Math.min(Number(input.limit) || 10, 25),
      });
      return txns.map((t) => ({
        merchant: t.merchant,
        amount: Number(t.amount),
        bucket: t.bucket?.name,
        occurredAt: t.occurredAt,
      }));
    }

    case "log_transaction": {
      const bucket = await prisma.bucket.findFirst({
        where: { name: { equals: String(input.bucket_name) }, archived: false },
      });
      if (!bucket) return { error: `No bucket named "${input.bucket_name}"` };
      const amount = Number(input.amount);
      const transaction = await prisma.transaction.create({
        data: {
          amount,
          merchant: input.merchant ?? null,
          note: input.note ?? null,
          source: "ASSISTANT_CHAT",
          isMicro: amount <= Number(bucket.microThreshold),
          bucketId: bucket.id,
          accountId: bucket.accountId,
          userId,
        },
      });
      const statuses = await getBucketStatuses();
      const status = statuses.find((s) => s.bucketId === bucket.id);
      return {
        logged: true,
        transactionId: transaction.id,
        feedback: status ? suggestionFor(status) : undefined,
      };
    }

    default:
      return { error: `Unknown tool ${name}` };
  }
}

/** Runs one assistant turn: given conversation history + a new user message, loops tool calls until Claude has a final reply. */
export async function runAssistantTurn(
  history: { role: ChatRole; content: string }[],
  userMessage: string,
  userId: string | null
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  for (let iteration = 0; iteration < 6; iteration++) {
    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      let result: unknown;
      try {
        result = await executeTool(block.name, block.input, userId);
      } catch (err: any) {
        result = { error: String(err?.message ?? err) };
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return "Sorry, I got stuck reasoning through that — could you try rephrasing?";
}
