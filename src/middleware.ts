export { default } from "next-auth/middleware";

export const config = {
  // Protect everything except auth routes, the WhatsApp webhook (which
  // authenticates via its own verify token / signature, not a session),
  // the login page, and static assets.
  matcher: [
    "/((?!api/auth|api/whatsapp|api/cron|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
