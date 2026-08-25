// Thin wrapper around Meta's WhatsApp Cloud API (Graph API).
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

/** Send a plain text reply to a WhatsApp user. */
export async function sendWhatsAppText(toPhone: string, body: string) {
  const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  const token = requireEnv("WHATSAPP_ACCESS_TOKEN");

  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhone,
      type: "text",
      text: { body, preview_url: false },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Resolve a media id to a temporary download URL, then fetch the bytes. */
export async function downloadWhatsAppMedia(
  mediaId: string
): Promise<{ base64: string; mimeType: string }> {
  const token = requireEnv("WHATSAPP_ACCESS_TOKEN");

  const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error(`Failed to resolve media ${mediaId}: ${metaRes.status}`);
  const meta = (await metaRes.json()) as { url: string; mime_type: string };

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes.ok) throw new Error(`Failed to download media ${mediaId}: ${fileRes.status}`);
  const buf = Buffer.from(await fileRes.arrayBuffer());

  return { base64: buf.toString("base64"), mimeType: meta.mime_type };
}
