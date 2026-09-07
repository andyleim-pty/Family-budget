"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/household";
import type { AccountType } from "@/lib/enums";

export async function createAccount(formData: FormData) {
  const householdId = await requireHouseholdId();
  const name = String(formData.get("name") ?? "").trim();
  const institution = String(formData.get("institution") ?? "").trim() || null;
  const type = String(formData.get("type") ?? "CHECKING") as AccountType;
  const currency = String(formData.get("currency") ?? "AUD").trim() || "AUD";
  const balance = Number(formData.get("balance") ?? 0);
  if (!name) throw new Error("Account name is required");

  await prisma.account.create({ data: { householdId, name, institution, type, currency, balance } });
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function archiveAccount(id: string) {
  const householdId = await requireHouseholdId();
  const { count } = await prisma.account.updateMany({
    where: { id, householdId },
    data: { archived: true },
  });
  if (count === 0) throw new Error("Account not found");
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function updateAccountBalance(id: string, balance: number) {
  const householdId = await requireHouseholdId();
  const { count } = await prisma.account.updateMany({
    where: { id, householdId },
    data: { balance },
  });
  if (count === 0) throw new Error("Account not found");
  revalidatePath("/accounts");
  revalidatePath("/");
}
