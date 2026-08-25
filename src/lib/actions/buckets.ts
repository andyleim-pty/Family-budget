"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { BucketKind } from "@/lib/enums";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Not authenticated");
  return session;
}

export async function createBucket(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const kind = String(formData.get("kind") ?? "ESSENTIAL") as BucketKind;
  const monthlyLimit = Number(formData.get("monthlyLimit") ?? 0);
  const microThreshold = Number(formData.get("microThreshold") ?? 15);
  const color = String(formData.get("color") ?? "#22c56b");
  const accountId = String(formData.get("accountId") ?? "");
  if (!name || !accountId) throw new Error("Name and account are required");

  await prisma.bucket.create({
    data: { name, description, kind, monthlyLimit, microThreshold, color, accountId },
  });
  revalidatePath("/buckets");
  revalidatePath("/");
}

export async function archiveBucket(id: string) {
  await requireSession();
  await prisma.bucket.update({ where: { id }, data: { archived: true } });
  revalidatePath("/buckets");
  revalidatePath("/");
}

export async function updateBucketLimit(id: string, monthlyLimit: number) {
  await requireSession();
  await prisma.bucket.update({ where: { id }, data: { monthlyLimit } });
  revalidatePath("/buckets");
  revalidatePath("/");
}
