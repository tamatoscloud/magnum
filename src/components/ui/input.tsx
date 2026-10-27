import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-ink outline-none ring-brass/40 placeholder:text-ink-soft/50 focus:ring-2",
        className,
      )}
      {...props}
    />
  );
}
