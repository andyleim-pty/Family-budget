import Anthropic from "@anthropic-ai/sdk";
import type { StatementRow } from "@/lib/bank-feed/csv-import";

let _client: Anthropic | null = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const TOOL_NAME = "record_statement_rows";

const SYSTEM_PROMPT = `You extract expense transactions from a bank/card statement — whether it's
pasted text, a photographed paper statement, or a PDF export. Extract only money leaving the
account: purchases, fees, withdrawals. Skip deposits, refunds, payments received, transfers in,
interest earned, or anything that isn't an expense. If a transaction's year isn't shown, infer the
most likely one from context (e.g. other dated rows nearby); if truly undeterminable, use null.
Use your judgement on merchant names — clean up obvious noise (e.g. "SQ *STARBUCKS 4421" →
"Starbucks") but don't invent details that aren't there. Note in "note" anything you couldn't read
clearly or are unsure about. Be thorough — a real statement often has many rows; don't stop early.`;

const extractionTool: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Record every expense transaction found in the statement.",
  input_schema: {
    type: "object",
    properties: {
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            amount: { type: "number", description: "Positive amount, no currency symbol." },
            merchant: { type: "string" },
            occurred_at: { type: ["string", "null"], description: "YYYY-MM-DD, or null if truly undeterminable." },
          },
          required: ["amount", "merchant", "occurred_at"],
        },
      },
      note: { type: "string", description: "Anything unclear, illegible, or worth flagging. Empty string if nothing." },
    },
    required: ["transactions", "note"],
  },
};

export type StatementExtraction = { rows: StatementRow[]; note: string };

function parseToolResult(message: Anthropic.Message): StatementExtraction {
  const toolUse = message.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
  if (!toolUse) throw new Error("Model did not return a structured extraction");
  const input = toolUse.input as any;

  const rows: StatementRow[] = (input.transactions ?? [])
    .map((t: any) => ({
      amount: Number(t.amount),
      description: String(t.merchant ?? "").trim() || "Unknown merchant",
      occurredAt: t.occurred_at ? new Date(t.occurred_at) : new Date(),
    }))
    .filter((r: StatementRow) => Number.isFinite(r.amount) && r.amount > 0);

  return { rows, note: input.note ?? "" };
}

/** Extract expense rows from pasted statement text (e.g. copied out of a bank's app). */
export async function extractStatementFromText(text: string): Promise<StatementExtraction> {
  const message = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [extractionTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: `Pasted statement text:\n\n${text}` }],
  });
  return parseToolResult(message);
}

/** Extract expense rows from an uploaded/forwarded document — a PDF statement, or a photo of one. */
export async function extractStatementFromDocument(
  base64: string,
  mediaType: string
): Promise<StatementExtraction> {
  const isPdf = mediaType.includes("pdf");
  const message = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [extractionTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          isPdf
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
            : { type: "image", source: { type: "base64", media_type: mediaType as any, data: base64 } },
          { type: "text", text: "This is a bank/card statement. Extract the expense transactions." },
        ],
      },
    ],
  });
  return parseToolResult(message);
}
