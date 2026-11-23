"use client";

import { useEffect, useState } from "react";

function remainingMs(expiresAt: string): number {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now());
}

function format(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Shows how long the verified session has left. When it reaches zero the page
 * reloads; the server then sees the expired session and shows the verify form
 * again, so the shareholder must re-enter their name and folio to download.
 */
export function SessionCountdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() => remainingMs(expiresAt));

  useEffect(() => {
    const tick = () => {
      const ms = remainingMs(expiresAt);
      setLeft(ms);
      if (ms <= 0) window.location.reload();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  return (
    <p className="tm-small text-[0.95rem]" role="timer" aria-live="off">
      For your security this session ends in{" "}
      <span className="font-medium tabular-nums text-tm-brown">{format(left)}</span>. After that you will need to verify your
      name and folio number again.
    </p>
  );
}
