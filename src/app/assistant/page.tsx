import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Nav from "@/components/Nav";
import ChatWindow from "@/components/ChatWindow";
import { getOrCreateConversation, getRecentMessages } from "@/lib/conversations";

export default async function AssistantPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const conversation = userId ? await getOrCreateConversation({ channel: "WEB", userId }) : null;
  const history = conversation ? await getRecentMessages(conversation.id) : [];

  return (
    <div className="flex flex-col h-screen">
      <Nav userName={session?.user?.name ?? ""} />
      <main className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 flex-1 flex flex-col min-h-0">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">Budget assistant</h1>
          <p className="text-sm text-gray-500">
            Ask before you spend — "should I get a $5 coffee?" — or ask how the month's going.
            Real numbers from your buckets and pockets, not guesses.
          </p>
        </div>
        <ChatWindow initialMessages={history} />
      </main>
    </div>
  );
}
