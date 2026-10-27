"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function DocumentRetry({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        onClick={async () => {
          const response = await fetch(`/api/admin/documents/${id}/retry`, { method: "POST" });
          if (!response.ok) {
            const body = (await response.json()) as { error?: string };
            setError(body.error ?? "Retry failed.");
            return;
          }
          router.refresh();
        }}
      >
        Retry
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
