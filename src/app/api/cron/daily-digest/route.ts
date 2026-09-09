import { NextRequest, NextResponse } from "next/server";
import { sendDailyDigests } from "@/lib/digest";

// Hit by an external scheduler (Vercel Cron, cron-job.org, GitHub Actions, …)
// once a day. See README.md "Proactive digests" for how to wire this up.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const result = await sendDailyDigests();
  return NextResponse.json({ ok: true, ...result });
}
