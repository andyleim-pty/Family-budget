-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PARTNER',
    "whatsappPhone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CHECKING',
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "balance" DECIMAL NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Bucket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'ESSENTIAL',
    "monthlyLimit" DECIMAL NOT NULL,
    "microThreshold" DECIMAL NOT NULL DEFAULT 15,
    "color" TEXT NOT NULL DEFAULT '#22c56b',
    "icon" TEXT NOT NULL DEFAULT 'wallet',
    "accountId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bucket_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pocket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "goalType" TEXT NOT NULL DEFAULT 'OTHER',
    "targetAmount" DECIMAL,
    "targetDate" DATETIME,
    "monthlyContribution" DECIMAL NOT NULL DEFAULT 0,
    "currentAmount" DECIMAL NOT NULL DEFAULT 0,
    "accountId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Pocket_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PocketContribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pocketId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "note" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PocketContribution_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "Pocket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PocketContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "merchant" TEXT,
    "note" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "isMicro" BOOLEAN NOT NULL DEFAULT false,
    "aiConfidence" REAL,
    "aiRawNote" TEXT,
    "bucketId" TEXT,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "Bucket" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "waMessageId" TEXT NOT NULL,
    "fromPhone" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "mediaId" TEXT,
    "transcript" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "errorMessage" TEXT,
    "transactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InboundMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InboundMessage_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_whatsappPhone_key" ON "User"("whatsappPhone");

-- CreateIndex
CREATE INDEX "Bucket_accountId_idx" ON "Bucket"("accountId");

-- CreateIndex
CREATE INDEX "Pocket_accountId_idx" ON "Pocket"("accountId");

-- CreateIndex
CREATE INDEX "PocketContribution_pocketId_idx" ON "PocketContribution"("pocketId");

-- CreateIndex
CREATE INDEX "Transaction_bucketId_idx" ON "Transaction"("bucketId");

-- CreateIndex
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");

-- CreateIndex
CREATE INDEX "Transaction_occurredAt_idx" ON "Transaction"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_waMessageId_key" ON "InboundMessage"("waMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_transactionId_key" ON "InboundMessage"("transactionId");
