import { Job } from "bullmq";
import { ingestion_helper } from "../../api/utils.ts";
import { logger } from "../../conf/logger.ts";
import { updateIngestLog } from "../../service/ingest.ts";
import { WorkerException } from "../../conf/exec.ts";

export default async function (job: Job) {
    const { ingest_id, filename } = job.data; 
    try {
        logger.info(`Thread ${process.pid} is parsing ${filename}`);
        await updateIngestLog({ status: "processing" }, ingest_id);

        const result = await ingestion_helper(job.data, job.data?.ingest_id);

        if (result && !result!.error) {
            await updateIngestLog({ status: "completed" }, ingest_id);
            logger.info(`Job ${job.id} completed`);
            return { success: true };
        } else {
            throw new WorkerException(result?.error ? String(result.error) : "Helper returned invalid result");
        }

    } catch (error) {
        logger.error(`Error processing file ${filename}: ${error}`);
        throw new WorkerException(`Error processing file ${filename}: ${error}`);
    }
}