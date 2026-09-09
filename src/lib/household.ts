import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * The current logged-in user's household id — every household-scoped query
 * in the app should filter by this. Throws if there's no session, which
 * should never happen behind the auth middleware; server actions call this
 * explicitly since actions aren't covered by middleware.
 */
export async function requireHouseholdId(): Promise<string> {
  const session = await getServerSession(authOptions);
  const householdId = (session?.user as any)?.householdId;
  if (!householdId) throw new Error("Not authenticated");
  return householdId;
}

/** Like requireHouseholdId(), but also returns the current user's id — for actions that attribute a record to the person who made it. */
export async function requireSessionUser(): Promise<{ userId: string; householdId: string }> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  const householdId = (session?.user as any)?.householdId;
  if (!userId || !householdId) throw new Error("Not authenticated");
  return { userId, householdId };
}
