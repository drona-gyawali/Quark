import { getRelevantContext } from "./vector-db.ts";
import {
  llmResponse,
  contextString,
  Response,
  getSTM,
  addSTMMessage,
  handleMemoryCompression,
  stmContext,
} from "./helpers.ts";
import type { mem0RequestAdd, mem0RequestSearch } from "./pipeline.js";
import { env } from "../conf/conf.ts";
import {
  generateEmbedding,
  mem0Search,
  mem0Add,
  streamCollector,
} from "./utils.ts";
import { RetrivalExecption } from "./exec.ts";
import { SIMILARITY_THRESHOLD, VECTOR_LIMIT } from "./consts.ts";
import { EmbedRequestInputType } from "voyageai";
import { logger } from "../conf/logger.ts";

export const retriveContext = async (
  retrival: mem0RequestSearch,
  _mem0Search: mem0RequestSearch,
  _mem0Add: mem0RequestAdd,
  options?: {
    onComplete?: (fullText: string) => Promise<void>; // The injected DB logic
  },
) => {
  logger.info(`[RETERIVAL ENGINE] has been started`);
  try {
    const stmMessage = await getSTM(retrival.sessionId ?? "");
    const contextMemory = await mem0Search(_mem0Search);

    const queryVector = (await generateEmbedding(
      retrival.message,
      EmbedRequestInputType.Query,
    )) as number[];

    const topCandidates = await getRelevantContext(
      env.COLLECTION_NAME,
      retrival.message,
      queryVector,
      VECTOR_LIMIT,
    );

    if (
      topCandidates.length === 0 ||
      (topCandidates[0].score ?? 0) < SIMILARITY_THRESHOLD
    ) {
      return {
        answer: "I could not find any relevant notes for your question.",
        sources: [],
      };
    }

    const _contextString = contextString(topCandidates);
    const finalPrompt = Response(
      `${stmContext(stmMessage)}\n${contextMemory}\n${_contextString}`,
      retrival.message,
    );

    const llmPromise = llmResponse(undefined, finalPrompt);

    const stream = streamCollector(llmPromise, async (finalText) => {
      try {
        if (options?.onComplete) {
          await options
            .onComplete(finalText)
            .catch((err) =>
              logger.error(`Engine: onComplete callback failed: ${err}`),
            );
        }

        await addSTMMessage(retrival.sessionId ?? "", {
          role: "user",
          content: retrival.message,
        });

        await addSTMMessage(retrival.sessionId ?? "", {
          role: "assistant",
          content: finalText,
        });

        await handleMemoryCompression(
          retrival.sessionId ?? "",
          async (summary: string) => {
            const payload = {
              ..._mem0Add,
              messages: [{ role: "system", content: summary }],
            };
            await mem0Add(payload);
          },
        );

        logger.info(
          `[Quark] Successfully persisted session: ${retrival.sessionId}`,
        );
      } catch (err) {
        logger.error(`[Quark] Post-stream persistence failed: ${err}`);
      }
    });

    return {
      stream,
      sources: topCandidates,
    };
  } catch (error) {
    logger.error(`Retrival Error: ${error}`);
    throw new RetrivalExecption(
      `Error while processing retrieval layer: ${error}`,
    );
  }
};
