import Image from "next/image";
import { cn } from "@/lib/utils";

/** Corporate lock-up: "The Magnum Ice Cream Company" with the Wall's heart. 2880×974 source, ratio ≈ 2.957. */
const LOGO = {
  dark: "/images/brand/magnum-logo.png",
  light: "/images/brand/magnum-logo-ivory.png",
  width: 1440,
  height: 487,
} as const;

export function BrandLogo({
  tone = "dark",
  className,
  priority = false,
}: {
  /** "dark" for light backgrounds, "light" for chocolate backgrounds. */
  tone?: "dark" | "light";
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={tone === "light" ? LOGO.light : LOGO.dark}
      alt="The Magnum Ice Cream Company"
      width={LOGO.width}
      height={LOGO.height}
      priority={priority}
      sizes="(min-width: 1024px) 220px, 180px"
      className={cn("h-auto w-44 select-none object-contain", className)}
    />
  );
}

/** Gold "MAGNUM — true to pleasure" consumer wordmark, for dark surfaces. */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <Image
      src="/images/brand/magnum-wordmark-gold.png"
      alt="Magnum — true to pleasure"
      width={1600}
      height={683}
      sizes="240px"
      className={cn("h-auto w-48 select-none object-contain", className)}
    />
  );
}
