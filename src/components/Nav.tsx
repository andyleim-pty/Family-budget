"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/buckets", label: "Buckets" },
  { href: "/pockets", label: "Savings pockets" },
  { href: "/accounts", label: "Accounts" },
  { href: "/settings", label: "Settings" },
];

export default function Nav({ userName }: { userName: string }) {
  const pathname = usePathname();
  return (
    <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <div className="flex items-center gap-8">
          <span className="font-bold text-lg text-brand-700">🏡 Family Budget</span>
          <nav className="hidden md:flex gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  pathname === l.href
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 hidden sm:inline">{userName}</span>
          <button className="btn btn-secondary" onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
          </button>
        </div>
      </div>
      <nav className="md:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${
              pathname === l.href ? "bg-brand-50 text-brand-700" : "text-gray-600"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
