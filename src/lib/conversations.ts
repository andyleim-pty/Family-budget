import { prisma } from "@/lib/prisma";
import type { ConversationChannel, ChatRole } from "@/lib/enums";

const HISTORY_LIMIT = 20; // messages of context sent to the model per turn

export async function getOrCreateConversation(opts: {
  channel: ConversationChannel;
  userId?: string | null;
  phone?: string | null;
}) {
  const where =
    opts.channel === "WHATSAPP"
      ? { channel: "WHATSAPP", phone: opts.phone ?? undefined }
      : { channel: "WEB", userId: opts.userId ?? undefined };

  const existing = await prisma.conversation.findFirst({ where, orderBy: { updatedAt: "desc" } });
  if (existing) return existing;

  return prisma.conversation.create({
    data: { channel: opts.channel, userId: opts.userId ?? null, phone: opts.phone ?? null },
  });
}

export async function getRecentMessages(conversationId: string) {
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  return messages.reverse().map((m) => ({ role: m.role as ChatRole, content: m.content }));
}

export async function appendMessage(conversationId: string, role: ChatRole, content: string) {
  await prisma.$transaction([
    prisma.chatMessage.create({ data: { conversationId, role, content } }),
    prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
  ]);
}
