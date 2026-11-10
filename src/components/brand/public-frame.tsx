import Image from "next/image";
import { BrandLogo, BrandWordmark } from "@/components/brand/brand-logo";

/**
 * Two-column frame for public and sign-in pages: chocolate product imagery on
 * large screens, a compact brand header on mobile. Purely presentational.
 */
export function PublicFrame({ eyebrow, children }: { eyebrow?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="chocolate-surface relative hidden overflow-hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_400px_at_20%_45%,rgb(212_175_55/0.14),transparent_70%)]" aria-hidden="true" />
        <div className="relative p-10">
          <BrandLogo tone="light" className="w-52" priority />
        </div>
        <figure className="relative mx-10 overflow-hidden rounded-3xl border border-gold/30 shadow-2xl shadow-black/40">
          <Image
            src="/images/brand/magnum-hero-chocolate.png"
            alt="Magnum Signature ice cream bars on silky chocolate"
            width={1433}
            height={367}
            priority
            sizes="45vw"
            className="h-auto w-full object-cover"
          />
        </figure>
        <div className="relative space-y-4 p-10">
          <BrandWordmark className="w-56" />
          <div className="gold-rule max-w-xs" />
          <p className="max-w-sm text-sm leading-6 text-paper/80">
            Shareholder communications from The Magnum Ice Cream Company, delivered privately and securely.
          </p>
        </div>
      </aside>
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-line bg-card/70 px-6 py-4 backdrop-blur lg:hidden">
          <BrandLogo className="w-32" priority />
        </header>
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12 sm:py-16">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brass">{eyebrow}</p>
          ) : null}
          {children}
        </main>
        <footer className="border-t border-line px-6 py-5 text-xs text-ink-soft">
          © {new Date().getFullYear()} The Magnum Ice Cream Company.
        </footer>
      </div>
    </div>
  );
}
