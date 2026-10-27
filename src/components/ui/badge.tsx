import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  DRAFT: "bg-[#efe7d8] text-ink",
  UPLOADED: "bg-[#efe7d8] text-ink",
  VALIDATING: "bg-[#efe7d8] text-warn",
  READY: "bg-[#e5f2ea] text-ok",
  PROCESSING: "bg-[#efe7d8] text-warn",
  COMPLETED: "bg-[#e5f2ea] text-ok",
  COMPLETED_WITH_ERRORS: "bg-[#f8ead2] text-warn",
  FAILED: "bg-[#f8e4e4] text-danger",
  CANCELLED: "bg-[#ece7df] text-ink-soft",
  ENCRYPTED: "bg-[#e5f2ea] text-ok",
  QUARANTINED: "bg-[#f8e4e4] text-danger",
  PENDING: "bg-[#efe7d8] text-ink-soft",
  ACTIVE: "bg-[#e5f2ea] text-ok",
  REVOKED: "bg-[#f8e4e4] text-danger",
  EXPIRED: "bg-[#ece7df] text-ink-soft",
  SENT: "bg-[#e5f2ea] text-ok",
  DELIVERED: "bg-[#e5f2ea] text-ok",
  MOCK_RECORDED: "bg-[#efe7d8] text-brass",
  QUEUED: "bg-[#efe7d8] text-ink-soft",
  UNKNOWN: "bg-[#efe7d8] text-ink-soft",
  ERROR: "bg-[#f8e4e4] text-danger",
  WARNING: "bg-[#f8ead2] text-warn",
};

export function Badge({ value }: { value: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", tones[value] ?? "bg-paper text-ink")}>
      {value === "MOCK_RECORDED" ? "Mock delivery" : value.replaceAll("_", " ")}
    </span>
  );
}
