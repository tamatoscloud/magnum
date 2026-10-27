import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import Redis from "ioredis";
import { getEnv } from "@/lib/env";

export const QUEUE_NAMES = {
  validation: "batch-validation",
  encryption: "pdf-encryption",
  email: "email-delivery",
  whatsapp: "whatsapp-delivery",
  report: "report-generation",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const queues = new Map<string, Queue>();
let producer: Redis | null = null;

export function createRedisConnection(): Redis {
  return new Redis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}

function producerConnection(): Redis {
  if (!producer) producer = createRedisConnection();
  return producer;
}

export function getQueue(name: QueueName): Queue {
  const existing = queues.get(name);
  if (existing) return existing;
  const queue = new Queue(name, { connection: producerConnection() as unknown as ConnectionOptions });
  queues.set(name, queue);
  return queue;
}

const defaultJobOptions: JobsOptions = {
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export async function enqueueValidation(batchId: string): Promise<void> {
  await getQueue(QUEUE_NAMES.validation).add(
    "validate",
    { batchId },
    { ...defaultJobOptions, jobId: `validate-${batchId}-${Date.now()}`, attempts: 2, backoff: { type: "exponential", delay: 3000 } },
  );
}

export async function enqueuePrepare(batchId: string): Promise<void> {
  await getQueue(QUEUE_NAMES.validation).add(
    "prepare",
    { batchId },
    { ...defaultJobOptions, jobId: `prepare-${batchId}-${Date.now()}`, attempts: 3, backoff: { type: "exponential", delay: 3000 } },
  );
}

export async function enqueueEncryption(customerId: string, generation: string): Promise<void> {
  await getQueue(QUEUE_NAMES.encryption).add(
    "encrypt",
    { customerId },
    {
      ...defaultJobOptions,
      jobId: `encrypt-${customerId}-${generation}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    },
  );
}

export async function enqueueEmail(deliveryAttemptId: string): Promise<void> {
  await getQueue(QUEUE_NAMES.email).add(
    "send-email",
    { deliveryAttemptId },
    { ...defaultJobOptions, jobId: `email-${deliveryAttemptId}`, attempts: 5, backoff: { type: "exponential", delay: 10000 } },
  );
}

export async function enqueueWhatsApp(deliveryAttemptId: string): Promise<void> {
  await getQueue(QUEUE_NAMES.whatsapp).add(
    "send-whatsapp",
    { deliveryAttemptId },
    { ...defaultJobOptions, jobId: `whatsapp-${deliveryAttemptId}`, attempts: 5, backoff: { type: "exponential", delay: 15000 } },
  );
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  queues.clear();
  if (producer) {
    const connection = producer;
    producer = null;
    connection.disconnect();
  }
}

export async function enqueueReport(exportId: string): Promise<void> {
  await getQueue(QUEUE_NAMES.report).add(
    "report",
    { exportId },
    { ...defaultJobOptions, jobId: `report-${exportId}`, attempts: 2, backoff: { type: "exponential", delay: 3000 } },
  );
}
