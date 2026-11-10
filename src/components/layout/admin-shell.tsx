"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { cn } from "@/lib/utils";

export type NavLink = { href: string; label: string };

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

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
  const pathname = usePathname() ?? "";
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <aside
        className={cn(
          open ? "flex" : "hidden",
          "chocolate-surface flex-col border-b border-gold/20 text-paper lg:sticky lg:top-0 lg:flex lg:h-screen lg:border-b-0 lg:border-r",
        )}
      >
        <div className="flex items-center justify-between px-6 pb-5 pt-7">
          <Link href="/admin" aria-label="Magnum admin dashboard" className="block">
            <BrandLogo tone="light" className="w-40" priority />
          </Link>
          <button className="text-paper/80 hover:text-gold lg:hidden" onClick={() => setOpen(false)} type="button" aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <div className="gold-rule mx-6 mb-4" />
        <p className="px-6 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-gold-soft">Shareholder portal</p>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-8">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative block rounded-xl px-3 py-2 text-sm transition-colors duration-150",
                  active
                    ? "bg-gold/10 font-semibold text-gold before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-gold"
                    : "text-paper/75 hover:bg-white/5 hover:text-paper",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-gold/15 px-6 py-5 text-sm">
          <p className="font-medium text-paper">{user.name}</p>
          <p className="text-xs uppercase tracking-[0.18em] text-paper/55">{user.role.replaceAll("_", " ")}</p>
          <button
            className="mt-3 inline-flex items-center gap-1.5 text-gold transition-colors hover:text-paper"
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="chocolate-surface sticky top-0 z-20 flex items-center justify-between border-b border-gold/20 px-4 py-3 lg:hidden">
          <Link href="/admin" aria-label="Magnum admin dashboard">
            <BrandLogo tone="light" className="w-28" />
          </Link>
          <button className="text-paper hover:text-gold" type="button" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
