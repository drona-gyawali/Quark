import { Redis } from "ioredis";
import { env } from "../conf/conf.ts";
import { Queue } from "bullmq";

// Connection for Workers: Retains 'null' to wait indefinitely during outages
export const redisWorkerConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

// Connection for Producers (API): Fails fast so the API doesn't hang
export const redisProducerConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: true,
});

export const INGESTION_QUEUE_NAME = "doc-ingest";
export const CHAT_QUEUE_NAME = "chat-queue";

// The Queue instance used by the API routes should use the Producer connection
export const IngestionQueue = new Queue(INGESTION_QUEUE_NAME, {
  connection: redisProducerConnection,
});

export const ChatQueue = new Queue(CHAT_QUEUE_NAME, {
  connection: redisProducerConnection,
});
