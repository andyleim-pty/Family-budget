"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/household";
import type { BucketKind } from "@/lib/enums";

export async function createBucket(formData: FormData) {
  const householdId = await requireHouseholdId();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const kind = String(formData.get("kind") ?? "ESSENTIAL") as BucketKind;
  const monthlyLimit = Number(formData.get("monthlyLimit") ?? 0);
  const microThreshold = Number(formData.get("microThreshold") ?? 15);
  const color = String(formData.get("color") ?? "#22c56b");
  const accountId = String(formData.get("accountId") ?? "");
  if (!name || !accountId) throw new Error("Name and account are required");

  // Confirms the account belongs to this household before attaching a
  // bucket to it — otherwise a forged accountId could fund a bucket from
  // another household's account.
  const account = await prisma.account.findFirst({ where: { id: accountId, householdId } });
  if (!account) throw new Error("Account not found");

  await prisma.bucket.create({
    data: { householdId, name, description, kind, monthlyLimit, microThreshold, color, accountId },
  });
  revalidatePath("/buckets");
  revalidatePath("/");
}

export async function archiveBucket(id: string) {
  const householdId = await requireHouseholdId();
  const { count } = await prisma.bucket.updateMany({
    where: { id, householdId },
    data: { archived: true },
  });
  if (count === 0) throw new Error("Bucket not found");
  revalidatePath("/buckets");
  revalidatePath("/");
}

export async function updateBucketLimit(id: string, monthlyLimit: number) {
  const householdId = await requireHouseholdId();
  const { count } = await prisma.bucket.updateMany({
    where: { id, householdId },
    data: { monthlyLimit },
  });
  if (count === 0) throw new Error("Bucket not found");
  revalidatePath("/buckets");
  revalidatePath("/");
}
