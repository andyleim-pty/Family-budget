import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

let _client: Anthropic | null = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export type CategorizationResult = {
  amount: number | null;
  currency: string;
  merchant: string | null;
  occurredAt: string | null; // ISO date, if extractable
  bucketId: string | null;
  bucketName: string | null;
  confidence: number; // 0-1
  isMicro: boolean;
  note: string;
};

const TOOL_NAME = "record_expense";

function extractionTool(bucketList: string) {
  return {
    name: TOOL_NAME,
    description:
      "Record the extracted expense details and the best-matching household budget bucket.",
    input_schema: {
      type: "object" as const,
      properties: {
        amount: { type: ["number", "null"], description: "Total amount spent, as a plain number with no currency symbol." },
        currency: { type: "string", description: "ISO 4217 currency code, default AUD if unclear." },
        merchant: { type: ["string", "null"], description: "Merchant / payee name if identifiable." },
        occurred_at: { type: ["string", "null"], description: "Date of the expense in YYYY-MM-DD if visible/inferable, else null." },
        bucket_name: {
          type: ["string", "null"],
          description: `Best-matching bucket name from this exact list (or null if none fit): ${bucketList}`,
        },
        confidence: { type: "number", description: "0-1 confidence in the bucket match." },
        note: { type: "string", description: "One short human-readable summary of the expense for a confirmation message." },
      },
      required: ["amount", "currency", "merchant", "occurred_at", "bucket_name", "confidence", "note"],
    },
  };
}

async function activeBuckets() {
  return prisma.bucket.findMany({
    where: { archived: false },
    select: { id: true, name: true, description: true, kind: true, microThreshold: true },
  });
}

function bucketListDescription(buckets: Awaited<ReturnType<typeof activeBuckets>>) {
  return buckets
    .map((b) => `"${b.name}" (${b.kind}${b.description ? `: ${b.description}` : ""})`)
    .join(", ");
}

async function runTool(systemPrompt: string, userContent: Anthropic.MessageParam["content"]) {
  const buckets = await activeBuckets();
  const bucketList = bucketListDescription(buckets);

  const message = await client().messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 1024,
    system: systemPrompt,
    tools: [extractionTool(bucketList)],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = message.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
  if (!toolUse) throw new Error("Model did not return a structured extraction");
  const input = toolUse.input as any;

  const matchedBucket = buckets.find(
    (b) => b.name.toLowerCase() === String(input.bucket_name ?? "").toLowerCase()
  );
  const amount = typeof input.amount === "number" ? input.amount : null;
  const microThreshold = matchedBucket ? Number(matchedBucket.microThreshold) : 15;

  const result: CategorizationResult = {
    amount,
    currency: input.currency || "AUD",
    merchant: input.merchant ?? null,
    occurredAt: input.occurred_at ?? null,
    bucketId: matchedBucket?.id ?? null,
    bucketName: matchedBucket?.name ?? null,
    confidence: typeof input.confidence === "number" ? input.confidence : 0.5,
    isMicro: amount !== null && amount <= microThreshold,
    note: input.note ?? "",
  };
  return result;
}

const SYSTEM_PROMPT = `You help a household track spending from WhatsApp messages (receipt
photos, voice-note transcripts, or free text). Extract the expense details and pick the
single best-matching budget bucket from the provided list. If nothing fits well, or the
message isn't actually about an expense, set bucket_name to null and explain briefly in
"note". Prefer the "MICRO" kind bucket for small everyday purchases (coffee, snacks,
parking, small taps) when a dedicated one exists. Be decisive — this runs unattended.`;

/** Categorize a receipt photo (base64-encoded image). */
export async function categorizeImage(base64: string, mediaType: string): Promise<CategorizationResult> {
  return runTool(SYSTEM_PROMPT, [
    {
      type: "image",
      source: { type: "base64", media_type: mediaType as any, data: base64 },
    },
    {
      type: "text",
      text: "This is a photo of a receipt or an expense-related screenshot sent over WhatsApp. Extract the expense and record it.",
    },
  ]);
}

/** Categorize a plain-text description (typed message, or a voice-note transcript). */
export async function categorizeText(text: string): Promise<CategorizationResult> {
  return runTool(SYSTEM_PROMPT, [
    {
      type: "text",
      text: `WhatsApp message describing an expense: "${text}"`,
    },
  ]);
}
