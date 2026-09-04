// Source of truth for the string-enum fields stored in SQLite (Prisma's
// SQLite connector doesn't support native enums — see prisma/schema.prisma).

export const ROLES = ["OWNER", "PARTNER"] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNT_TYPES = ["CHECKING", "SAVINGS", "CREDIT_CARD", "CASH"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const BUCKET_KINDS = ["ESSENTIAL", "DISCRETIONARY", "MICRO"] as const;
export type BucketKind = (typeof BUCKET_KINDS)[number];
export const BUCKET_KIND_LABELS: Record<BucketKind, string> = {
  ESSENTIAL: "Essential",
  DISCRETIONARY: "Discretionary",
  MICRO: "Micro-expenses",
};

export const POCKET_GOAL_TYPES = ["HOLIDAY", "FESTIVITY", "TRIP", "EMERGENCY", "OTHER"] as const;
export type PocketGoalType = (typeof POCKET_GOAL_TYPES)[number];
export const POCKET_GOAL_LABELS: Record<PocketGoalType, string> = {
  HOLIDAY: "Holiday",
  FESTIVITY: "Festivity",
  TRIP: "Trip",
  EMERGENCY: "Emergency fund",
  OTHER: "Other goal",
};

export const TRANSACTION_SOURCES = [
  "MANUAL",
  "WHATSAPP_IMAGE",
  "WHATSAPP_AUDIO",
  "WHATSAPP_TEXT",
  "ASSISTANT_CHAT",
  "IMPORT",
] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const MESSAGE_KINDS = ["IMAGE", "AUDIO", "TEXT"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const MESSAGE_STATUSES = [
  "RECEIVED",
  "PROCESSING",
  "NEEDS_CONFIRMATION",
  "CONFIRMED",
  "ANSWERED", // handled as a chat/question, not filed as a transaction
  "FAILED",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const CONVERSATION_CHANNELS = ["WEB", "WHATSAPP"] as const;
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

export const CHAT_ROLES = ["user", "assistant"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];
