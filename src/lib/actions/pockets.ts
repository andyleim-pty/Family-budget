"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { PocketGoalType } from "@/lib/enums";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Not authenticated");
  return session;
}

export async function createPocket(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const goalType = String(formData.get("goalType") ?? "OTHER") as PocketGoalType;
  const targetAmountRaw = formData.get("targetAmount");
  const targetAmount = targetAmountRaw ? Number(targetAmountRaw) : null;
  const targetDateRaw = formData.get("targetDate");
  const targetDate = targetDateRaw ? new Date(String(targetDateRaw)) : null;
  const monthlyContribution = Number(formData.get("monthlyContribution") ?? 0);
  const accountId = String(formData.get("accountId") ?? "");
  if (!name || !accountId) throw new Error("Name and account are required");

  await prisma.pocket.create({
    data: { name, goalType, targetAmount, targetDate, monthlyContribution, accountId },
  });
  revalidatePath("/pockets");
  revalidatePath("/");
}

export async function contributeToPocket(formData: FormData) {
  const session = await requireSession();
  const pocketId = String(formData.get("pocketId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!pocketId || !amount) throw new Error("Pocket and amount are required");

  await prisma.$transaction([
    prisma.pocketContribution.create({
      data: {
        pocketId,
        amount,
        note,
        userId: (session.user as any)?.id ?? null,
      },
    }),
    prisma.pocket.update({
      where: { id: pocketId },
      data: { currentAmount: { increment: amount } },
    }),
  ]);
  revalidatePath("/pockets");
  revalidatePath("/");
}

export async function archivePocket(id: string) {
  await requireSession();
  await prisma.pocket.update({ where: { id }, data: { archived: true } });
  revalidatePath("/pockets");
  revalidatePath("/");
}
