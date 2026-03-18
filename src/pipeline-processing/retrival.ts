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
import type {
  mem0RequestAdd,
  mem0RequestSearch,
  RetrivalRequest,
} from "./pipeline.js";
import { env } from "./conf.ts";
import { generateEmbedding, mem0Search, mem0Add } from "./utils.ts";
import { RetrivalExecption } from "./exec.ts";
import { SIMILARITY_THRESHOLD, VECTOR_LIMIT } from "./consts.ts";
import { EmbedRequestInputType } from "voyageai";
import { logger } from "../conf/logger.ts";

export const retriveContext = async (
  retrival: RetrivalRequest,
  _mem0Search: mem0RequestSearch,
  _mem0Add: mem0RequestAdd,
) => {
  try {
    const stmMessage = await getSTM(retrival.sessionId ?? "");
    const contextMemory = await mem0Search(_mem0Search);
    const queryVector = (await generateEmbedding(
      retrival.message,
      EmbedRequestInputType.Query,
    )) as number[];
    const topCandidates = await getRelevantContext(
      retrival.filters,
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
      retrival.filters,
      retrival.message,
    );
    const answer = await llmResponse(undefined, finalPrompt);

    void addSTMMessage(retrival.sessionId ?? "", {
      role: "user",
      content: retrival.message,
    }).catch((err) => logger.error(`Failed to store user STM message: ${err}`));

    void addSTMMessage(retrival.sessionId ?? "", {
      role: "assistant",
      content: answer,
    }).catch((err) =>
      logger.error("Failed to store assistant STM message:", err),
    );

    void handleMemoryCompression(
      retrival.sessionId ?? "",
      async (summary: string) => {
        const payload = {
          ..._mem0Add,
          messages: [{ role: "system", content: summary }],
        };
        await mem0Add(payload).catch((err) =>
          logger.error("Failed to save LTM summary:", err),
        );
      },
    ).catch((err) => logger.error("Memory compression failed:", err));

    return {
      answer,
      sources: [],
    };
  } catch (error) {
    logger.error(`Retrival Error: ${error}`);
    throw new RetrivalExecption(
      `Error while processing retrieval layer: ${error}`,
    );
  }
};
