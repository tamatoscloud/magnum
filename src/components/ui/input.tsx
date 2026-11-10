import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink outline-none transition-colors duration-150 placeholder:text-ink-soft/50 hover:border-gold-soft/70 focus:border-gold focus:ring-2 focus:ring-gold/30",
        className,
      )}
      {...props}
    />
  );
}
