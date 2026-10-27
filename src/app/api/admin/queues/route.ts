import { json, requirePermission, toErrorResponse } from "@/lib/http";
import { QUEUE_NAMES, getQueue, type QueueName } from "@/server/jobs/queues";
import { sanitizeErrorMessage } from "@/lib/security/sanitize";

export async function GET(): Promise<Response> {
  try {
    await requirePermission("queues:read");
    const names = Object.values(QUEUE_NAMES);
    const queues = await Promise.all(
      names.map(async (name) => {
        const counts = await getQueue(name as QueueName).getJobCounts("waiting", "active", "failed", "delayed", "completed");
        const failed = await getQueue(name as QueueName).getFailed(0, 10);
        return {
          name,
          counts,
          failed: failed.map((job) => ({
            id: job.id,
            name: job.name,
            attemptsMade: job.attemptsMade,
            failedReason: sanitizeErrorMessage(job.failedReason ?? ""),
          })),
        };
      }),
    );
    return json({ queues });
  } catch (error) {
    return toErrorResponse(error);
  }
}
