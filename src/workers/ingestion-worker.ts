import { Worker } from "bullmq";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  redisConnection,
  INGESTION_QUEUE_NAME,
} from "../shared/queue-config.ts";
import { logger } from "../conf/logger.ts";
import { updateIngestLog } from "../service/ingest.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const processorPath = path.join(
  __dirname,
  "processors",
  "ingestion-processor.ts",
);

const worker = new Worker(INGESTION_QUEUE_NAME, processorPath, {
  connection: redisConnection,
  useWorkerThreads: true,
  concurrency: 5,
  workerForkOptions: {
    execArgv: ["--experimental-specifier-resolution=node"],
  },
});

worker.on("ready", () => {
  logger.info("Quark Ingestion Worker is online and waiting for jobs...");
});

worker.on("failed", (job, err) => {
  logger.error(`Job ${job?.id} failed in Redis: ${err.message}`);

  if (job?.data?.ingest_id) {
    updateIngestLog(
      {
        err_msg: String(err),
        status: "failed",
      },
      job.data.ingest_id,
    )
      .then(() => {
        logger.info(`Successfully logged failure for job ${job.id}`);
      })
      .catch((dbErr) => {
        logger.error(`Critical: Could not update DB for failed job: ${dbErr}`);
      });
  }
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down worker...");
  await worker.close();
});
