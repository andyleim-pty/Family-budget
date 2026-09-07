"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId, requireSessionUser } from "@/lib/household";

export async function createManualTransaction(formData: FormData) {
  const { userId, householdId } = await requireSessionUser();
  const amount = Number(formData.get("amount") ?? 0);
  const merchant = String(formData.get("merchant") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const bucketId = String(formData.get("bucketId") ?? "");
  const occurredAtRaw = String(formData.get("occurredAt") ?? "");
  if (!amount || !bucketId) throw new Error("Amount and bucket are required");

  const bucket = await prisma.bucket.findFirst({ where: { id: bucketId, householdId } });
  if (!bucket) throw new Error("Bucket not found");

  await prisma.transaction.create({
    data: {
      householdId,
      amount,
      merchant,
      note,
      occurredAt: occurredAtRaw ? new Date(occurredAtRaw) : new Date(),
      source: "MANUAL",
      isMicro: amount <= Number(bucket.microThreshold),
      bucketId,
      accountId: bucket.accountId,
      userId,
    },
  });
  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function deleteTransaction(id: string) {
  const householdId = await requireHouseholdId();
  const { count } = await prisma.transaction.deleteMany({ where: { id, householdId } });
  if (count === 0) throw new Error("Transaction not found");
  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function recategorizeTransaction(id: string, formData: FormData) {
  const householdId = await requireHouseholdId();
  const bucketId = String(formData.get("bucketId") ?? "");
  if (!bucketId) throw new Error("Bucket is required");

  const [transaction, bucket] = await Promise.all([
    prisma.transaction.findFirst({ where: { id, householdId } }),
    prisma.bucket.findFirst({ where: { id: bucketId, householdId } }),
  ]);
  if (!transaction || !bucket) throw new Error("Not found");

  await prisma.transaction.update({
    where: { id },
    data: { bucketId, accountId: bucket.accountId },
  });
  revalidatePath("/transactions");
  revalidatePath("/");
}
