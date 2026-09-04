"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrCreateConversation, getRecentMessages, appendMessage } from "@/lib/conversations";
import { runAssistantTurn } from "@/lib/ai/assistant";
import { revalidatePath } from "next/cache";

async function requireUserId() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) throw new Error("Not authenticated");
  return userId as string;
}

/** Sends a message to the budget assistant from the web UI and returns its reply. */
export async function sendAssistantMessage(userMessage: string): Promise<string> {
  const userId = await requireUserId();
  const conversation = await getOrCreateConversation({ channel: "WEB", userId });
  const history = await getRecentMessages(conversation.id);

  const reply = await runAssistantTurn(history, userMessage, userId);

  await appendMessage(conversation.id, "user", userMessage);
  await appendMessage(conversation.id, "assistant", reply);
  revalidatePath("/assistant");
  revalidatePath("/"); // a log_transaction call may have changed budget totals
  revalidatePath("/transactions");
  return reply;
}
