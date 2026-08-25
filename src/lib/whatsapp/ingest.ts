import { prisma } from "@/lib/prisma";
import { categorizeImage, categorizeText, type CategorizationResult } from "@/lib/ai/categorize";
import { transcribeAudio } from "@/lib/ai/transcribe";
import { downloadWhatsAppMedia, sendWhatsAppText } from "@/lib/whatsapp/client";
import { getBucketStatuses, suggestionFor } from "@/lib/budget";
import type { MessageKind } from "@/lib/enums";

type InboundWhatsAppMessage = {
  waMessageId: string;
  fromPhone: string;
  kind: MessageKind;
  mediaId?: string;
  text?: string;
};

const PENDING_WINDOW_MS = 30 * 60 * 1000; // a numeric reply older than this starts a fresh expense instead

/** Entry point called by the webhook route for every inbound message. */
export async function handleInboundWhatsAppMessage(msg: InboundWhatsAppMessage) {
  const existing = await prisma.inboundMessage.findUnique({ where: { waMessageId: msg.waMessageId } });
  if (existing) return; // WhatsApp retries webhooks; ignore duplicates.

  const user = await prisma.user.findUnique({ where: { whatsappPhone: msg.fromPhone } });

  // A short numeric/bucket-name reply to a still-fresh pending message is
  // treated as a correction rather than a brand-new expense.
  if (msg.kind === "TEXT" && msg.text) {
    const pending = await findRecentPending(msg.fromPhone);
    if (pending) {
      const resolved = await tryResolvePendingReply(pending, msg.text.trim());
      if (resolved) return;
    }
  }

  const record = await prisma.inboundMessage.create({
    data: {
      waMessageId: msg.waMessageId,
      fromPhone: msg.fromPhone,
      userId: user?.id,
      kind: msg.kind,
      mediaId: msg.mediaId,
      status: "PROCESSING",
    },
  });

  try {
    let result: CategorizationResult;

    if (msg.kind === "IMAGE") {
      if (!msg.mediaId) throw new Error("Image message missing media id");
      const { base64, mimeType } = await downloadWhatsAppMedia(msg.mediaId);
      result = await categorizeImage(base64, mimeType);
    } else if (msg.kind === "AUDIO") {
      if (!msg.mediaId) throw new Error("Audio message missing media id");
      const { base64, mimeType } = await downloadWhatsAppMedia(msg.mediaId);
      const transcript = await transcribeAudio(base64, mimeType);
      await prisma.inboundMessage.update({ where: { id: record.id }, data: { transcript } });
      result = await categorizeText(transcript);
    } else {
      if (!msg.text) throw new Error("Text message missing body");
      result = await categorizeText(msg.text);
    }

    await finishProcessing(record.id, msg.fromPhone, user?.id ?? null, result, msg.kind);
  } catch (err: any) {
    await prisma.inboundMessage.update({
      where: { id: record.id },
      data: { status: "FAILED", errorMessage: String(err?.message ?? err) },
    });
    await safeReply(
      msg.fromPhone,
      friendlyErrorMessage(err) +
        "\n\nYou can also just type it, e.g. \"$12.50 coffee\" or add it in the app."
    );
  }
}

function friendlyErrorMessage(err: any): string {
  const message = String(err?.message ?? err);
  if (message.includes("OPENAI_API_KEY")) {
    return "I couldn't transcribe that voice note yet (transcription isn't configured). Try a text message or a photo of the receipt instead.";
  }
  if (message.includes("ANTHROPIC_API_KEY")) {
    return "Expense categorization isn't configured yet — ask whoever set this up to add an Anthropic API key.";
  }
  return "Sorry, I couldn't process that message. Mind trying again?";
}

async function finishProcessing(
  inboundMessageId: string,
  fromPhone: string,
  userId: string | null,
  result: CategorizationResult,
  kind: MessageKind
) {
  if (result.amount === null) {
    await prisma.inboundMessage.update({
      where: { id: inboundMessageId },
      data: { status: "FAILED", errorMessage: "No amount detected", extractedJson: JSON.stringify(result) },
    });
    await safeReply(
      fromPhone,
      `I couldn't find an amount in that message${result.note ? ` (${result.note})` : ""}. Try again with the amount included, e.g. "$8.50 sandwich".`
    );
    return;
  }

  if (result.bucketId && result.confidence >= 0.6) {
    await commitTransaction(inboundMessageId, fromPhone, userId, result, result.bucketId, kind);
    return;
  }

  // Low confidence or no match — ask which bucket it belongs to.
  const buckets = await prisma.bucket.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  await prisma.inboundMessage.update({
    where: { id: inboundMessageId },
    data: { status: "NEEDS_CONFIRMATION", extractedJson: JSON.stringify(result) },
  });

  const options = buckets.map((b, i) => `${i + 1}. ${b.name}`).join("\n");
  const merchantBit = result.merchant ? ` at ${result.merchant}` : "";
  await safeReply(
    fromPhone,
    `Got it — ${formatMoney(result.amount, result.currency)}${merchantBit}. Which bucket should this come from? Reply with a number:\n${options}`
  );
}

async function commitTransaction(
  inboundMessageId: string,
  fromPhone: string,
  userId: string | null,
  result: CategorizationResult,
  bucketId: string,
  kind: MessageKind
) {
  const bucket = await prisma.bucket.findUniqueOrThrow({ where: { id: bucketId } });

  const transaction = await prisma.transaction.create({
    data: {
      amount: result.amount!,
      currency: result.currency,
      merchant: result.merchant,
      note: result.note,
      occurredAt: result.occurredAt ? new Date(result.occurredAt) : new Date(),
      source: mapKindToSource(kind),
      isMicro: result.isMicro,
      aiConfidence: result.confidence,
      aiRawNote: result.note,
      bucketId: bucket.id,
      accountId: bucket.accountId,
      userId,
    },
  });

  await prisma.inboundMessage.update({
    where: { id: inboundMessageId },
    data: { status: "CONFIRMED", transactionId: transaction.id, extractedJson: JSON.stringify(result) },
  });

  const statuses = await getBucketStatuses();
  const status = statuses.find((s) => s.bucketId === bucket.id);
  const feedback = status ? suggestionFor(status) : `Logged to ${bucket.name}.`;
  const microNote = result.isMicro
    ? "\n(Flagged as a micro-expense — these add up fast, check the dashboard for the running total.)"
    : "";

  await safeReply(
    fromPhone,
    `✅ ${formatMoney(result.amount!, result.currency)}${result.merchant ? ` at ${result.merchant}` : ""} logged to *${bucket.name}*.\n${feedback}${microNote}\n\nWrong bucket? Reply "fix <bucket name>" within 30 min.`
  );
}

async function findRecentPending(fromPhone: string) {
  const cutoff = new Date(Date.now() - PENDING_WINDOW_MS);
  return prisma.inboundMessage.findFirst({
    where: { fromPhone, status: "NEEDS_CONFIRMATION", createdAt: { gte: cutoff } },
    orderBy: { createdAt: "desc" },
  });
}

/** Returns true if `text` was consumed as a resolution of the pending message. */
async function tryResolvePendingReply(
  pending: { id: string; extractedJson: string | null },
  text: string
): Promise<boolean> {
  const buckets = await prisma.bucket.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  let chosen: { id: string; name: string } | undefined;
  const asNumber = Number(text);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= buckets.length) {
    chosen = buckets[asNumber - 1];
  } else {
    const cleaned = text.toLowerCase().replace(/^fix\s+/, "").trim();
    chosen = buckets.find((b) => b.name.toLowerCase() === cleaned);
  }
  if (!chosen || !pending.extractedJson) return false;

  const result: CategorizationResult = JSON.parse(pending.extractedJson);
  const fullPending = await prisma.inboundMessage.findUniqueOrThrow({ where: { id: pending.id } });

  const bucket = await prisma.bucket.findUniqueOrThrow({ where: { id: chosen.id } });
  const transaction = await prisma.transaction.create({
    data: {
      amount: result.amount!,
      currency: result.currency,
      merchant: result.merchant,
      note: result.note,
      occurredAt: result.occurredAt ? new Date(result.occurredAt) : new Date(),
      source: mapKindToSource(fullPending.kind as MessageKind),
      isMicro: Number(result.amount) <= Number(bucket.microThreshold),
      aiConfidence: result.confidence,
      aiRawNote: result.note,
      bucketId: bucket.id,
      accountId: bucket.accountId,
      userId: fullPending.userId,
    },
  });

  await prisma.inboundMessage.update({
    where: { id: pending.id },
    data: { status: "CONFIRMED", transactionId: transaction.id },
  });

  const statuses = await getBucketStatuses();
  const status = statuses.find((s) => s.bucketId === bucket.id);
  const feedback = status ? suggestionFor(status) : `Logged to ${bucket.name}.`;
  await safeReply(
    fullPending.fromPhone,
    `✅ Filed under *${bucket.name}*. ${feedback}`
  );
  return true;
}

function mapKindToSource(kind: MessageKind) {
  if (kind === "IMAGE") return "WHATSAPP_IMAGE" as const;
  if (kind === "AUDIO") return "WHATSAPP_AUDIO" as const;
  return "WHATSAPP_TEXT" as const;
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

async function safeReply(toPhone: string, body: string) {
  try {
    await sendWhatsAppText(toPhone, body);
  } catch (err) {
    // Don't let a WhatsApp send failure mask a successfully-processed
    // transaction — just log it.
    console.error("Failed to send WhatsApp reply:", err);
  }
}
