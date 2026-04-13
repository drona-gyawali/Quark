import { Job } from "bullmq";
import { logger } from "../../conf/logger.ts";
import { WorkerException } from "../../conf/exec.ts";
import { dumpChatHistory } from "../../service/chat.ts";
import { addSTMMessage } from "../../pipeline-processing/helpers.ts";
import { handleMemoryCompression } from "../../pipeline-processing/helpers.ts";
import { mem0Add } from "../../pipeline-processing/utils.ts";

export default async function (job: Job) {
    const { sessionId, assistantMessage, mem0Payload } = job.data; 
    try {
        logger.info(`Thread ${process.pid} is starting..`);
         await dumpChatHistory({
            session_id: String(sessionId),
            role: "assistant",
            content: assistantMessage,
        });
        logger.info(`Assistant response saved in the database`)

      await addSTMMessage(sessionId, {
        role: "assistant",
        content: assistantMessage,
      });
      logger.info(`STM added new context in the brain`)

      await handleMemoryCompression(sessionId, async (summary) => {
        await mem0Add({
          ...mem0Payload,
          message: summary,
        });
      });
    } catch (error) {
        logger.error(`Error processing chat queue worker  ${error}`);
        throw new WorkerException(`Error processing chat queue worker ${error}`);
    }
}