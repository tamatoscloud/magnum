"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function BatchPoller() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [router]);
  return <p className="text-sm text-ink-soft">Working through the queue. This page refreshes automatically.</p>;
}
