import { Worker } from "bullmq";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  redisWorkerConnection,
  CHAT_QUEUE_NAME,
} from "../shared/queue-config.ts";
import { logger } from "../conf/logger.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ext = __filename.endsWith(".ts") ? ".ts" : ".js";

export const processorPath = path.join(
  __dirname,
  "processors",
  `chat-queue-processor${ext}`,
);

const worker = new Worker(CHAT_QUEUE_NAME, processorPath, {
  connection: redisWorkerConnection,
  useWorkerThreads: true,
  concurrency: 5,
  workerThreadsOptions: {
    execArgv: ext === ".ts" ? ["--import", "tsx"] : [],
  },
});

worker.on("ready", () => {
  logger.info("ChatQueue Worker is online and waiting for jobs...");
});

worker.on("failed", (job, err) => {
  logger.error(`Job ${job?.id} failed in Redis: ${err.message}`);
});

process.on("SIGTERM", () => {
  logger.info("Shutting down worker...");
  void worker.close().catch((err) => {
    logger.error(`Failed to close worker cleanly: ${err}`);
    process.exitCode = 1;
  });
});
