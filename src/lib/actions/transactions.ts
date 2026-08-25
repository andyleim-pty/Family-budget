"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Not authenticated");
  return session;
}

export async function createManualTransaction(formData: FormData) {
  const session = await requireSession();
  const amount = Number(formData.get("amount") ?? 0);
  const merchant = String(formData.get("merchant") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const bucketId = String(formData.get("bucketId") ?? "");
  const occurredAtRaw = String(formData.get("occurredAt") ?? "");
  if (!amount || !bucketId) throw new Error("Amount and bucket are required");

  const bucket = await prisma.bucket.findUniqueOrThrow({ where: { id: bucketId } });

  await prisma.transaction.create({
    data: {
      amount,
      merchant,
      note,
      occurredAt: occurredAtRaw ? new Date(occurredAtRaw) : new Date(),
      source: "MANUAL",
      isMicro: amount <= Number(bucket.microThreshold),
      bucketId,
      accountId: bucket.accountId,
      userId: (session.user as any)?.id ?? null,
    },
  });
  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function deleteTransaction(id: string) {
  await requireSession();
  await prisma.transaction.delete({ where: { id } });
  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function recategorizeTransaction(id: string, formData: FormData) {
  await requireSession();
  const bucketId = String(formData.get("bucketId") ?? "");
  if (!bucketId) throw new Error("Bucket is required");
  const bucket = await prisma.bucket.findUniqueOrThrow({ where: { id: bucketId } });
  await prisma.transaction.update({
    where: { id },
    data: { bucketId, accountId: bucket.accountId },
  });
  revalidatePath("/transactions");
  revalidatePath("/");
}
