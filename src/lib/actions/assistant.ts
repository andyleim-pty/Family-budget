"use server";

import { requireSessionUser } from "@/lib/household";
import { getOrCreateConversation, getRecentMessages, appendMessage } from "@/lib/conversations";
import { runAssistantTurn } from "@/lib/ai/assistant";
import { revalidatePath } from "next/cache";

/** Sends a message to the budget assistant from the web UI and returns its reply. */
export async function sendAssistantMessage(userMessage: string): Promise<string> {
  const { userId, householdId } = await requireSessionUser();
  const conversation = await getOrCreateConversation({ householdId, channel: "WEB", userId });
  const history = await getRecentMessages(conversation.id);

  const reply = await runAssistantTurn(history, userMessage, userId, householdId, conversation.id);

  await appendMessage(conversation.id, "user", userMessage);
  await appendMessage(conversation.id, "assistant", reply);
  revalidatePath("/assistant");
  revalidatePath("/"); // a log_transaction call may have changed budget totals
  revalidatePath("/transactions");
  return reply;
}
