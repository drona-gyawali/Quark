import {
  DIAGRAM_TEXT,
  TABLE_TEXT,
  STM_PREFIX,
  MAX_MESSAGES,
  TTL_SECONDS,
  TRIM_TO,
} from "./consts.ts";

import { ClientException, PipelineException } from "./exec.ts";
import { llm, env, redis } from "../conf/conf.ts";
import type { DocumentElement, ChatMessage } from "./pipeline.ts";
import crypto from "node:crypto";
import { marked } from "marked";
import prompts from "./prompts.json" with { type: "json" };
import { logger } from "../conf/logger.ts";

export const getStaticPrompt = (eleType: string) => {
  return eleType === "Image" ? DIAGRAM_TEXT : TABLE_TEXT;
};

const mimeType_ = (base64Image: string) => {
  const mimeType = "image/jpeg";
  if (base64Image.startsWith("iVBORw0KGgo")) {
    return "image/png";
  } else if (base64Image.startsWith("/9j/")) {
    return "image/jpeg";
  } else if (base64Image.startsWith("R0lGOD")) {
    return "image/gif";
  } else if (base64Image.startsWith("UklGR")) {
    return "image/webp";
  } else {
    return mimeType;
  }
};

export const isDocumentElement = (obj: any): obj is DocumentElement => {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.type === "string" &&
    typeof obj.text === "string"
  );
};

export async function htmlTableToMarkdown(html: string): Promise<string> {
  const md = await marked(html, { gfm: true });
  return md;
}

export const isBase64 = (base64Image: string, ele: any) => {
  if (base64Image.length < 200) {
    logger.warn(
      `[skip] Element ${ele.element_id} base64 too short (${base64Image.length} chars)`,
    );
    return false;
  }

  if (
    !base64Image.startsWith("iVBOR") &&
    !base64Image.startsWith("/9j/") &&
    !base64Image.startsWith("R0lGOD") &&
    !base64Image.startsWith("UklGR")
  ) {
    logger.warn(
      `[skip] Element ${ele.element_id} base64 does not look like image data`,
    );
    return false;
  }

  return true;
};

export const llmResponse = async (base64Image?: string, message?: string) => {
  if (!message?.trim()) {
    throw new ClientException("Prompt/message cannot be empty");
  }

  const hasImage = typeof base64Image === "string" && base64Image.length > 200;

  let messages: any;
  let mimeType: string | undefined;

  if (hasImage) {
    mimeType = mimeType_(base64Image);

    logger.debug(
      `[vision-llm] Preparing call → ` +
        `mime=${mimeType}, ` +
        `base64-length=${base64Image.length}, ` +
        `prompt-length=${message.length}`,
    );

    messages = [
      {
        role: "user",
        content: [
          { type: "text", text: message },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ];
  } else {
    logger.debug(`[text-llm] Preparing call → prompt-length=${message.length}`);

    messages = [
      {
        role: "user",
        content: message,
      },
    ];
  }

  try {
    const response = await llm(
      env.LLM_TOKEN,
      env.LLM_URL,
    ).chat.completions.create({
      model: env.LLM_MODEL,
      messages,
      max_tokens: 1000,
      temperature: 0.4,
      stream: true,
    });

    logger.info(`LLM started to streaming the response`);
    return response;
  } catch (err: any) {
    const errorMessage = err.message || String(err);

    logger.error(`[llm] Failed → error=${errorMessage}`);

    if (err.response) {
      logger.error(`[llm] Raw API response: ${err.response}`);
    }

    logger.error(`LLM request failed: ${errorMessage}`);
    throw new ClientException(`LLM request failed: ${errorMessage}`);
  }
};

export const nonStreamLLM = async (
  conversation: string,
  imageInput?: { base64?: string; url?: string },
) => {
  try {
    logger.info(`Starting the nonStreamLLM`);
    let contentPayload: any;

    if (imageInput?.url) {
      contentPayload = [
        { type: "text", text: conversation },
        {
          type: "image_url",
          image_url: {
            url: imageInput.url,
          },
        },
      ];
    } else if (imageInput?.base64) {
      const mimeType = mimeType_(imageInput.base64);

      contentPayload = [
        { type: "text", text: conversation },
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${imageInput.base64}`,
          },
        },
      ];
    } else {
      contentPayload = conversation;
    }

    const res = await llm(
      env.SUMMARIZER_AI_TOKEN,
      env.SUMMARIZER_AI_URL,
    ).chat.completions.create({
      model: env.SUMMARIZER_MODEL,
      messages: [{ role: "user", content: contentPayload }],
      stream: false,
      temperature: 0.1,
    });

    const content = res.choices?.[0]?.message?.content?.trim();

    if (!content) {
      logger.error("Summarizer AI unable to respond with the conversations");
      throw new ClientException(
        `Summarizer AI unable to respond with the conversations`,
      );
    }

    return content;
  } catch (error) {
    logger.error(
      `Summarizer AI unable to respond with the conversations: ${error}`,
    );
    throw new ClientException(
      `Summarizer AI unable to respond with the conversations: ${error}`,
    );
  }
};

export const prepareBatchRecords = (
  batchElements: any[],
  vectors: number[][],
  startIndex: number,
) => {
  try {
    return batchElements.map((el, idx) => ({
      id: crypto.randomUUID(),
      vector: vectors[idx],
      text: el.text,
      metadata: {
        ...el.metadata,
        chunkIndex: startIndex + idx,
        isVisual: el.type === "Image" || el.type === "Table",
      },
    }));
  } catch (error) {
    logger.error(`Error preparing batch records: ${error}`);
    throw new PipelineException(`Error preparing batch records: ${error}`);
  }
};

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const contextString = (topCandidates: any[]) => {
  const _contextString = topCandidates
    .map((hit, i) => {
      const typeLabel = hit.isVisual ? "VISUAL/DIAGRAM" : "TEXT";
      return `[Source ${i + 1} | ${typeLabel} | Page ${hit.page}]\nContent: ${hit.text}`;
    })
    .join("\n\n---\n\n");

  return _contextString;
};

/**
 * Replaces placeholders in a string (e.g., {{name}}) with values from an object.
 */
export const resolveTemplate = (
  template: string,
  data: Record<string, string>,
): string => {
  return template.replace(/{{(\w+)}}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
};

export const Response = (contextString: string, message: string) => {
  return resolveTemplate(prompts.templates.tutorResponse, {
    contextString: contextString,
    message: message,
  });
};

export const summarizeResponse = (conversation: string) => {
  return resolveTemplate(prompts.templates.Summarize, {
    conversation: conversation,
  });
};

export const addSTMMessage = async (
  sessionId: string,
  message: ChatMessage,
) => {
  const key = `${STM_PREFIX}${sessionId}`;

  await redis.rPush(
    key,
    JSON.stringify({
      ...message,
      timestamp: Date.now(),
    }),
  );
  await redis.lTrim(key, -MAX_MESSAGES, -1);
  await redis.expire(key, TTL_SECONDS);
};

export const getSTM = async (sessionId: string): Promise<ChatMessage[]> => {
  const key = `${STM_PREFIX}${sessionId}`;

  const raw = await redis.lRange(key, 0, -1);

  const _raw = raw.map((m) => JSON.parse(m));
  logger.info(`Getting the STM context from cache for: ${sessionId}`);
  return _raw;
};

export const stmContext = (
  messages: { role: string; content: string }[],
): string => {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n");
};

export const trimSTM = async (sessionId: string) => {
  const key = `${STM_PREFIX}${sessionId}`;
  logger.info(`Trimming the stm context for ${sessionId}`);
  await redis.lTrim(key, -TRIM_TO, -1);
};

export const handleMemoryCompression = async (
  sessionId: string,
  saveLongTermMemory: (text: string) => Promise<void>,
) => {
  const messages = await getSTM(sessionId);
  if (messages.length < 20) {
    logger.info(`Skipping the memory compression:  ${sessionId}`);
    return;
  }

  logger.info(`Starting the memory compression for: ${sessionId}`);
  const messagesToSummarize = messages.slice(0, 15);
  const message = stmContext(messagesToSummarize);
  const prompt = summarizeResponse(message);
  const summary = await nonStreamLLM(prompt);
  await saveLongTermMemory(summary);
  await trimSTM(sessionId);
};
