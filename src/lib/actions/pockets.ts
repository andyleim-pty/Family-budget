"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId, requireSessionUser } from "@/lib/household";
import type { PocketGoalType } from "@/lib/enums";

export async function createPocket(formData: FormData) {
  const householdId = await requireHouseholdId();
  const name = String(formData.get("name") ?? "").trim();
  const goalType = String(formData.get("goalType") ?? "OTHER") as PocketGoalType;
  const targetAmountRaw = formData.get("targetAmount");
  const targetAmount = targetAmountRaw ? Number(targetAmountRaw) : null;
  const targetDateRaw = formData.get("targetDate");
  const targetDate = targetDateRaw ? new Date(String(targetDateRaw)) : null;
  const monthlyContribution = Number(formData.get("monthlyContribution") ?? 0);
  const accountId = String(formData.get("accountId") ?? "");
  if (!name || !accountId) throw new Error("Name and account are required");

  const account = await prisma.account.findFirst({ where: { id: accountId, householdId } });
  if (!account) throw new Error("Account not found");

  await prisma.pocket.create({
    data: { householdId, name, goalType, targetAmount, targetDate, monthlyContribution, accountId },
  });
  revalidatePath("/pockets");
  revalidatePath("/");
}

export async function contributeToPocket(formData: FormData) {
  const { userId, householdId } = await requireSessionUser();
  const pocketId = String(formData.get("pocketId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!pocketId || !amount) throw new Error("Pocket and amount are required");

  const pocket = await prisma.pocket.findFirst({ where: { id: pocketId, householdId } });
  if (!pocket) throw new Error("Pocket not found");

  await prisma.$transaction([
    prisma.pocketContribution.create({
      data: { pocketId, amount, note, userId },
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
  const householdId = await requireHouseholdId();
  const { count } = await prisma.pocket.updateMany({
    where: { id, householdId },
    data: { archived: true },
  });
  if (count === 0) throw new Error("Pocket not found");
  revalidatePath("/pockets");
  revalidatePath("/");
}
