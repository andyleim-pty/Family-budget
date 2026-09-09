import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // There's no self-serve signup yet, so the household itself is seeded
  // too — find-or-create by name rather than assuming a fresh database.
  const householdName = process.env.HOUSEHOLD_NAME || "Our household";
  let household = await prisma.household.findFirst({ where: { name: householdName } });
  if (!household) {
    household = await prisma.household.create({ data: { name: householdName } });
  }
  const householdId = household.id;

  const owner = await upsertUser(householdId, {
    name: process.env.OWNER_NAME || "Andy",
    email: process.env.OWNER_EMAIL || "andy@example.com",
    password: process.env.OWNER_PASSWORD || "change-me-immediately",
    role: "OWNER",
    whatsappPhone: process.env.OWNER_WHATSAPP_PHONE || null,
  });

  await upsertUser(householdId, {
    name: process.env.PARTNER_NAME || "Partner",
    email: process.env.PARTNER_EMAIL || "partner@example.com",
    password: process.env.PARTNER_PASSWORD || "change-me-immediately",
    role: "PARTNER",
    whatsappPhone: process.env.PARTNER_WHATSAPP_PHONE || null,
  });

  const existingAccounts = await prisma.account.count({ where: { householdId } });
  if (existingAccounts === 0) {
    const everyday = await prisma.account.create({
      data: { householdId, name: "Joint everyday", type: "CHECKING", balance: 0 },
    });
    const savings = await prisma.account.create({
      data: { householdId, name: "Joint savings", type: "SAVINGS", balance: 0 },
    });

    await prisma.bucket.createMany({
      data: [
        {
          householdId,
          name: "Groceries",
          kind: "ESSENTIAL",
          monthlyLimit: 1200,
          microThreshold: 15,
          color: "#16a355",
          accountId: everyday.id,
          description: "Supermarket and fresh food shops.",
        },
        {
          householdId,
          name: "Utilities & bills",
          kind: "ESSENTIAL",
          monthlyLimit: 500,
          microThreshold: 15,
          color: "#2563eb",
          accountId: everyday.id,
          description: "Electricity, gas, water, internet, phone plans.",
        },
        {
          householdId,
          name: "Dining & takeaway",
          kind: "DISCRETIONARY",
          monthlyLimit: 300,
          microThreshold: 15,
          color: "#f59e0b",
          accountId: everyday.id,
          description: "Restaurants, cafes, food delivery.",
        },
        {
          householdId,
          name: "Micro-expenses",
          kind: "MICRO",
          monthlyLimit: 150,
          microThreshold: 15,
          color: "#a855f7",
          accountId: everyday.id,
          description:
            "Coffees, snacks, parking, small everyday taps — the death-by-a-thousand-cuts bucket.",
        },
        {
          householdId,
          name: "Kids & family",
          kind: "ESSENTIAL",
          monthlyLimit: 400,
          microThreshold: 15,
          color: "#ec4899",
          accountId: everyday.id,
          description: "School, activities, clothes, health.",
        },
      ],
    });

    await prisma.pocket.createMany({
      data: [
        {
          householdId,
          name: "Emergency fund",
          goalType: "EMERGENCY",
          targetAmount: 6000,
          monthlyContribution: 200,
          accountId: savings.id,
        },
        {
          householdId,
          name: "Christmas & festivities",
          goalType: "FESTIVITY",
          targetAmount: 1500,
          monthlyContribution: 125,
          accountId: savings.id,
        },
        {
          householdId,
          name: "Annual holiday",
          goalType: "HOLIDAY",
          targetAmount: 4000,
          monthlyContribution: 300,
          accountId: savings.id,
        },
      ],
    });

    console.log("Seeded demo accounts, buckets, and savings pockets.");
  }

  console.log(`Seed complete. Household: "${household.name}". Owner login: ${owner.email}`);
}

async function upsertUser(
  householdId: string,
  opts: {
    name: string;
    email: string;
    password: string;
    role: "OWNER" | "PARTNER";
    whatsappPhone: string | null;
  }
) {
  const passwordHash = await bcrypt.hash(opts.password, 10);
  return prisma.user.upsert({
    where: { email: opts.email.toLowerCase() },
    update: {},
    create: {
      householdId,
      name: opts.name,
      email: opts.email.toLowerCase(),
      passwordHash,
      role: opts.role,
      whatsappPhone: opts.whatsappPhone,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
