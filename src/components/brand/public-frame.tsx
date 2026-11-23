import Image from "next/image";

/**
 * Two-column frame for shareholder and sign-in pages, styled after the TMICC Pakistan
 * corporate site: the Annual Report cover on the left (on top on small screens) and the
 * content on a warm off-white page on the right. Purely presentational.
 */
export function PublicFrame({ eyebrow, children }: { eyebrow?: string; children: React.ReactNode }) {
  return (
    <div className="tm-page min-h-screen lg:grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
      <aside className="relative overflow-hidden bg-[#f8d474] lg:sticky lg:top-0 lg:h-screen">
        <Image
          src="/images/brand/annual-report-cover.jpg"
          alt="The Magnum Ice Cream Company Annual Report cover"
          width={1600}
          height={1842}
          priority
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="block h-auto max-h-[38vh] w-full object-cover object-[30%_top] lg:h-full lg:max-h-none"
        />
      </aside>
      <div className="flex min-h-screen flex-col">
        <main className="mx-auto flex w-full max-w-[540px] flex-1 flex-col justify-center px-6 py-8 sm:px-10 lg:py-8">
          {eyebrow ? <p className="tm-eyebrow">{eyebrow}</p> : null}
          {children}
        </main>
        <footer className="border-t border-tm-ink/10 px-6 py-4 text-xs text-tm-ink sm:px-10">
          © {new Date().getFullYear()} The Magnum Ice Cream Company.
        </footer>
      </div>
    </div>
  );
}
