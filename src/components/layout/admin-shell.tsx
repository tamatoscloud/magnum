"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { Menu, X } from "lucide-react";

export type NavLink = { href: string; label: string };

export function AdminShell({
  user,
  links,
  children,
}: {
  user: { name: string; email: string; role: string };
  links: NavLink[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <aside className={`${open ? "block" : "hidden"} border-b border-white/10 bg-ink text-paper lg:block`}>
        <div className="flex items-center justify-between px-5 py-6">
          <Link href="/admin" className="font-serif text-2xl tracking-[0.18em]">
            MAGNUM
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)} type="button" aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <nav className="space-y-1 px-3 pb-8">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="block rounded-xl px-3 py-2 text-sm text-paper/80 hover:bg-white/10 hover:text-paper">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 px-5 py-5 text-sm">
          <p className="font-medium">{user.name}</p>
          <p className="text-paper/60">{user.role.replaceAll("_", " ")}</p>
          <button className="mt-3 text-brass-bright" type="button" onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
          </button>
        </div>
      </aside>
      <div>
        <header className="flex items-center justify-between border-b border-line bg-card px-4 py-3 lg:hidden">
          <p className="font-serif tracking-[0.16em]">MAGNUM</p>
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
