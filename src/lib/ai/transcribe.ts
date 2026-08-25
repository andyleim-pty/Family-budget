import OpenAI from "openai";

/** Transcribe a WhatsApp voice note (ogg/opus) to text via OpenAI Whisper. */
export async function transcribeAudio(base64: string, mimeType: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured — voice note transcription is unavailable");
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const buffer = Buffer.from(base64, "base64");
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp3") ? "mp3" : "m4a";

  // The SDK needs a File-like object; construct one from the raw bytes.
  const file = await OpenAI.toFile(buffer, `voice-note.${ext}`);
  const transcription = await client.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return transcription.text;
}
