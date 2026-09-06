import { NextRequest, NextResponse } from "next/server";
import { buildWeeklyDigest, sendDigestToFamily } from "@/lib/digest";

// Hit by an external scheduler once a week (e.g. Monday morning). See
// README.md "Proactive digests" for how to wire this up.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const text = await buildWeeklyDigest();
  const result = await sendDigestToFamily(text);
  return NextResponse.json({ ok: true, ...result });
}
