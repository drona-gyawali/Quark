import { getRelevantContext } from "./vector-db.ts";
import {
  llmResponse,
  contextString,
  Response,
  getSTM,
  addSTMMessage,
  stmContext,
} from "./helpers.ts";

import type { mem0RequestAdd, mem0RequestSearch } from "./pipeline.js";
import { env } from "../conf/conf.ts";

import { generateEmbedding, mem0Search, streamCollector } from "./utils.ts";

import { RetrivalExecption } from "./exec.ts";
import { SIMILARITY_THRESHOLD, VECTOR_LIMIT } from "./consts.ts";
import { EmbedRequestInputType } from "voyageai";
import { logger } from "../conf/logger.ts";
import { ChatQueue } from "../shared/queue-config.ts";

export const retriveContext = async (
  retrival: mem0RequestSearch,
  _mem0Search: mem0RequestSearch,
  _mem0Add: mem0RequestAdd,
) => {
  logger.info(`[RETRIEVAL ENGINE] started`);

  try {
    const sessionId = retrival.sessionId ?? "";

    const stmMessage = await getSTM(sessionId);

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

    const finalPrompt = Response(
      `${stmContext(stmMessage)}\n${contextMemory}\n${contextString(topCandidates)}`,
      retrival.message,
    );

    const llmStream = llmResponse(undefined, finalPrompt);

    let finalText = "";

    const stream = streamCollector(llmStream, async (text) => {
      finalText = text;
    });

    addSTMMessage(sessionId, {
      role: "user",
      content: retrival.message,
    }).catch((err) => logger.error(`Failed to save user message: ${err}`));

    (async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 0));

        await ChatQueue.add("persist-chat", {
          sessionId,
          assistantMessage: finalText,
          mem0Payload: _mem0Add,
        });

        logger.info(`[Quark] Job queued for session: ${sessionId}`);
      } catch (err) {
        logger.error(`[Quark] Queue push failed: ${err}`);
      }
    })();

    return {
      stream,
      sources: topCandidates,
    };
  } catch (error) {
    logger.error(`Retrieval Error: ${error}`);

    throw new RetrivalExecption(
      `Error while processing retrieval layer: ${error}`,
    );
  }
};
