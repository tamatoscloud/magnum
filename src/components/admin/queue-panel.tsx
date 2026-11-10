"use client";

import { useEffect, useState } from "react";

type QueueSnapshot = {
  name: string;
  counts: Record<string, number>;
  failed: Array<{ id?: string; name?: string; attemptsMade: number; failedReason: string }>;
};

export function QueuePanel() {
  const [queues, setQueues] = useState<QueueSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/queues")
      .then(async (response) => {
        if (!response.ok) throw new Error("Queue status is unavailable.");
        return response.json() as Promise<{ queues: QueueSnapshot[] }>;
      })
      .then((body) => setQueues(body.queues))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Queue status is unavailable."));
  }, []);

  return (
    <section className="lux-card rounded-3xl border border-line bg-card p-5">
      <h2 className="font-serif text-2xl">Queues</h2>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 space-y-4">
        {queues.map((queue) => (
          <article key={queue.name} className="border-t border-line pt-3">
            <h3 className="font-medium">{queue.name}</h3>
            <p className="text-sm text-ink-soft">
              waiting {queue.counts.waiting ?? 0} · active {queue.counts.active ?? 0} · failed {queue.counts.failed ?? 0}
            </p>
            {queue.failed.map((job) => (
              <p key={job.id} className="mt-1 text-xs text-danger">
                {job.name} attempt {job.attemptsMade}: {job.failedReason}
              </p>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
