import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  DRAFT: "bg-[#f3ead9] text-ink",
  UPLOADED: "bg-[#f3ead9] text-ink",
  VALIDATING: "bg-[#f3ead9] text-warn",
  READY: "bg-[#e8f1e9] text-ok",
  PROCESSING: "bg-[#f3ead9] text-warn",
  COMPLETED: "bg-[#e8f1e9] text-ok",
  COMPLETED_WITH_ERRORS: "bg-[#f7ecd2] text-warn",
  FAILED: "bg-[#f7e3e1] text-danger",
  CANCELLED: "bg-[#eee8e1] text-ink-soft",
  ENCRYPTED: "bg-[#e8f1e9] text-ok",
  QUARANTINED: "bg-[#f7e3e1] text-danger",
  PENDING: "bg-[#f3ead9] text-ink-soft",
  ACTIVE: "bg-[#e8f1e9] text-ok",
  REVOKED: "bg-[#f7e3e1] text-danger",
  EXPIRED: "bg-[#eee8e1] text-ink-soft",
  SENT: "bg-[#e8f1e9] text-ok",
  DELIVERED: "bg-[#e8f1e9] text-ok",
  MOCK_RECORDED: "bg-[#f3ead9] text-brass",
  QUEUED: "bg-[#f3ead9] text-ink-soft",
  UNKNOWN: "bg-[#f3ead9] text-ink-soft",
  ERROR: "bg-[#f7e3e1] text-danger",
  WARNING: "bg-[#f7ecd2] text-warn",
};

export function Badge({ value }: { value: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border border-black/5 px-2.5 py-1 text-xs font-semibold tracking-wide", tones[value] ?? "bg-paper text-ink")}>
      {value === "MOCK_RECORDED" ? "Mock delivery" : value.replaceAll("_", " ")}
    </span>
  );
}
