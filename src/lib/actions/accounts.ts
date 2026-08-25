"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { AccountType } from "@/lib/enums";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Not authenticated");
  return session;
}

export async function createAccount(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const institution = String(formData.get("institution") ?? "").trim() || null;
  const type = String(formData.get("type") ?? "CHECKING") as AccountType;
  const currency = String(formData.get("currency") ?? "AUD").trim() || "AUD";
  const balance = Number(formData.get("balance") ?? 0);
  if (!name) throw new Error("Account name is required");

  await prisma.account.create({ data: { name, institution, type, currency, balance } });
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function archiveAccount(id: string) {
  await requireSession();
  await prisma.account.update({ where: { id }, data: { archived: true } });
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function updateAccountBalance(id: string, balance: number) {
  await requireSession();
  await prisma.account.update({ where: { id }, data: { balance } });
  revalidatePath("/accounts");
  revalidatePath("/");
}
