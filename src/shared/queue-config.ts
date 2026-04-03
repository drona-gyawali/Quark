import { Redis } from "ioredis";
import { env } from "../conf/conf.ts";
import { Queue } from "bullmq";

export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export const INGESTION_QUEUE_NAME = "doc-ingest";

export const IngestionQueue = new Queue(INGESTION_QUEUE_NAME, {
  connection: redisConnection,
});
