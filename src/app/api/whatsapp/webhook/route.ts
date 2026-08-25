import { NextRequest, NextResponse } from "next/server";
import { handleInboundWhatsAppMessage } from "@/lib/whatsapp/ingest";
import type { MessageKind } from "@/lib/enums";

// Meta's verification handshake when you configure the webhook URL in the
// Meta App Dashboard. See README.md "WhatsApp setup".
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// Inbound message webhook. WhatsApp expects a fast 200 response; the actual
// AI processing runs after we've acknowledged so Meta doesn't retry.
export async function POST(req: NextRequest) {
  const payload = await req.json();

  try {
    const entries = payload.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        for (const message of value?.messages ?? []) {
          const parsed = parseMessage(message);
          if (!parsed) continue;
          // Fire-and-forget: don't block the webhook ack on AI processing.
          handleInboundWhatsAppMessage(parsed).catch((err) =>
            console.error("Failed to handle WhatsApp message:", err)
          );
        }
      }
    }
  } catch (err) {
    console.error("Error parsing WhatsApp webhook payload:", err);
  }

  return NextResponse.json({ received: true });
}

function parseMessage(message: any): null | {
  waMessageId: string;
  fromPhone: string;
  kind: MessageKind;
  mediaId?: string;
  text?: string;
} {
  const fromPhone = message.from?.startsWith("+") ? message.from : `+${message.from}`;
  const waMessageId = message.id;
  if (!waMessageId || !fromPhone) return null;

  if (message.type === "image") {
    return { waMessageId, fromPhone, kind: "IMAGE", mediaId: message.image?.id };
  }
  if (message.type === "audio" || message.type === "voice") {
    return { waMessageId, fromPhone, kind: "AUDIO", mediaId: message.audio?.id ?? message.voice?.id };
  }
  if (message.type === "text") {
    return { waMessageId, fromPhone, kind: "TEXT", text: message.text?.body };
  }
  return null;
}
