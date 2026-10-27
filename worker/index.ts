import "../src/lib/load-env";
import { Worker, type ConnectionOptions } from "bullmq";
import { getEnv } from "../src/lib/env";
import { prisma } from "../src/lib/db/prisma";
import { sanitizeErrorMessage } from "../src/lib/security/sanitize";
import { QUEUE_NAMES, createRedisConnection, getQueue } from "../src/server/jobs/queues";
import { prepareBatch, validateBatch } from "../src/server/services/batch-service";
import { sendDeliveryAttempt } from "../src/server/services/delivery-service";
import { encryptCustomerDocument } from "../src/server/services/document-service";
import { generateBatchReport, runRetentionSweep } from "../src/server/services/report-service";

type BatchJob = { batchId: string };
type CustomerJob = { customerId: string };
type DeliveryJob = { deliveryAttemptId: string };
type ReportJob = { exportId?: string };

async function main(): Promise<void> {
  const env = getEnv();
  const workers = [
    new Worker(
      QUEUE_NAMES.validation,
      async (job) => {
        const data = job.data as BatchJob;
        if (job.name === "prepare") await prepareBatch(data.batchId);
        else await validateBatch(data.batchId);
      },
      { connection: createRedisConnection() as unknown as ConnectionOptions, concurrency: 2 },
    ),
    new Worker(
      QUEUE_NAMES.encryption,
      async (job) => {
        const data = job.data as CustomerJob;
        await encryptCustomerDocument(data.customerId);
      },
      { connection: createRedisConnection() as unknown as ConnectionOptions, concurrency: env.WORKER_CONCURRENCY },
    ),
    new Worker(
      QUEUE_NAMES.email,
      async (job) => {
        const data = job.data as DeliveryJob;
        await sendDeliveryAttempt(data.deliveryAttemptId);
      },
      { connection: createRedisConnection() as unknown as ConnectionOptions, concurrency: 5 },
    ),
    new Worker(
      QUEUE_NAMES.whatsapp,
      async (job) => {
        const data = job.data as DeliveryJob;
        await sendDeliveryAttempt(data.deliveryAttemptId);
      },
      {
        connection: createRedisConnection() as unknown as ConnectionOptions,
        concurrency: 2,
        limiter: { max: env.WHATSAPP_RATE_LIMIT_PER_SECOND, duration: 1000 },
      },
    ),
    new Worker(
      QUEUE_NAMES.report,
      async (job) => {
        if (job.name === "retention") {
          await runRetentionSweep();
          return;
        }
        const data = job.data as ReportJob;
        if (data.exportId) await generateBatchReport(data.exportId);
      },
      { connection: createRedisConnection() as unknown as ConnectionOptions, concurrency: 2 },
    ),
  ];

  for (const worker of workers) {
    worker.on("failed", (job, error) => {
      console.error(
        `job failed queue=${worker.name} id=${job?.id ?? "unknown"} ${sanitizeErrorMessage(error.message)}`,
      );
    });
  }

  await getQueue(QUEUE_NAMES.report).upsertJobScheduler(
    "retention-sweep",
    { every: 60 * 60 * 1000 },
    { name: "retention", data: {} },
  );

  console.log("Magnum worker is running.");

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await Promise.all(workers.map((worker) => worker.close()));
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error: unknown) => {
  console.error(sanitizeErrorMessage(error instanceof Error ? error.message : "Worker failed to start"));
  process.exit(1);
});
