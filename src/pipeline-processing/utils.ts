import { Strategy } from "unstructured-client/sdk/models/shared";
import { MAXCHAR, BATCHSIZE, limit, mem0Limit } from "./consts.ts";
import { PipelineException, RetrivalExecption } from "./exec.ts";
import { unstructured, env, embedding, memoClient } from "../conf/conf.ts";
import {
  getStaticPrompt,
  isBase64,
  prepareBatchRecords,
  htmlTableToMarkdown,
  sleep,
  nonStreamLLM,
} from "./helpers.ts";
import type {
  DocumentElement,
  mem0RequestSearch,
  mem0RequestAdd,
} from "./pipeline.ts";
import { dumpToDb, ensureCollectionExists } from "./vector-db.ts";
import { EmbedRequestInputType } from "voyageai";
import type { PartitionResponse } from "unstructured-client/sdk/models/operations";
import { logger } from "../conf/logger.ts";
import type { Stream } from "openai/streaming";
import type { ChatCompletionChunk } from "openai/resources";
import type { VisionResult } from "./pipeline.ts";
import { getContentAccess } from "../service/object.ts";

// TODO: remove the image , figure and Graphic from the block types
export const partitionDocument = async (
  fileBuffer: Buffer,
  fileName: string,
) => {
  try {
    const doc = await unstructured().general.partition({
      partitionParameters: {
        files: { content: fileBuffer, fileName: fileName },
        strategy: Strategy.HiRes,
        extractImageBlockTypes: ["Image", "Table", "Figure", "Graphic"],
        chunkingStrategy: "by_title",
        maxCharacters: MAXCHAR,
        splitPdfAllowFailed: true,
        includeOrigElements: false,
        splitPdfConcurrencyLevel: 15,
        pdfInferTableStructure: true,
      },
    });
    return doc;
  } catch (error) {
    logger.error(error);
    throw new PipelineException(`Error occured in Ingestion process: ${error}`);
  }
};

export const describeVisualElements = async (
  elements: DocumentElement[],
): Promise<DocumentElement[]> => {
  try {
    const processed = await Promise.all(
      elements.map((ele) =>
        limit(async () => {
          const imageUrl = ele.metadata?.image_url;
          const tableHtml = ele.metadata?.text_as_html;

          if (imageUrl) {
            let description: string;

            try {
              const signedUrl = await getContentAccess({
                key: imageUrl,
              });

              const promptType = ele.type === "Table" ? "Table" : "Image";

              description = await nonStreamLLM(getStaticPrompt(promptType), {
                url: signedUrl,
              });

              logger.info(`Visual analysis generated for ${ele.element_id}`);
            } catch (err) {
              logger.error(
                `[VISION ERROR] LLM failed for ${ele.element_id}: ${err}`,
              );
              return ele;
            }

            return {
              ...ele,
              text: `${ele.text}\n\n[Visual Analysis]: ${description}`,
              metadata: {
                ...ele.metadata,
                visual_description: description.substring(0, 500),
              },
            };
          }
          if (tableHtml) {
            try {
              const tableMarkdown = await htmlTableToMarkdown(tableHtml);

              return {
                ...ele,
                text: `${ele.text}\n\n[Structured Table Data]:\n${tableMarkdown}`,
                metadata: {
                  ...ele.metadata,
                  visual_description: "Table extracted via HTML-to-Markdown",
                },
              };
            } catch (mdErr) {
              logger.error(
                `[HTML-MD ERROR] Failed for ${ele.element_id}: ${mdErr}`,
              );
              return ele;
            }
          }

          return ele;
        }),
      ),
    );

    return processed;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Visual processing failed: ${msg}`);
    throw new PipelineException(`Visual processing failed: ${msg}`);
  }
};

export async function generateEmbedding(
  input: string | string[],
  inputType: EmbedRequestInputType,
): Promise<number[] | number[][]> {
  try {
    const inputArray = Array.isArray(input) ? input : [input];
    const res = await embedding().embed({
      model: env.EMBEDDING_MODEL,
      inputType: inputType,
      input: inputArray,
    });

    if (!res.data || res.data.length !== inputArray.length) {
      throw new PipelineException(
        "Embedding generation mismatch with input chunks",
      );
    }

    if (inputType === EmbedRequestInputType.Query) {
      const vector = res.data[0].embedding;
      if (!vector) {
        throw new PipelineException(
          "Embedding generation failed with input query",
        );
      }

      return vector as number[];
    }

    const vectors = res.data.map((item) => {
      if (!item.embedding) {
        throw new PipelineException("Missing embedding vector");
      }
      return item.embedding;
    });

    return vectors as number[][];
  } catch (error) {
    throw new PipelineException(
      `Error in Embedding Generation: ${String(error)}`,
    );
  }
}

export const processMetadata = async (elements: DocumentElement[]) => {
  try {
    await ensureCollectionExists(env.COLLECTION_NAME);

    for (let i = 0; i < elements.length; i += BATCHSIZE) {
      const currBatch = elements.slice(i, i + BATCHSIZE);

      const textBatch = currBatch.map((el) => el.text ?? "");

      const vectors = (await generateEmbedding(
        textBatch,
        EmbedRequestInputType.Document,
      )) as number[][];

      if (vectors.length !== currBatch.length) {
        throw new PipelineException(
          "Embedding count does not match batch size",
        );
      }

      const batchRecords = prepareBatchRecords(currBatch, vectors, i);

      await dumpToDb(env.COLLECTION_NAME, batchRecords);
      if (i + BATCHSIZE < elements.length) {
        logger.debug("Respecting Rate Limits: Sleeping for 21 seconds...");
        await sleep(21000);
      }
    }

    return { success: true };
  } catch (error) {
    throw new PipelineException(
      `Error while processing metadata & saving to DB: ${String(error)}: targeting ${env.COLLECTION_NAME}`,
    );
  }
};

export const visionMaker = (
  raw: PartitionResponse,
  visionResult: VisionResult,
  fileName: string,
): DocumentElement[] => {
  try {
    if (!Array.isArray(raw)) {
      throw new PipelineException("Partition did not return array of elements");
    }

    const elements: DocumentElement[] = raw.map((ele: any) => ({ ...ele }));

    visionResult.images.forEach((img, idx) => {
      elements.push({
        type: "Image",
        element_id: `vision-${img.page}-${idx}-${Date.now()}`,
        text: "",
        metadata: {
          page_number: img.page,
          image_url: img.s3_key,
          filename: fileName,
        },
      });
    });

    return elements.sort(
      (a, b) => (a.metadata?.page_number ?? 0) - (b.metadata?.page_number ?? 0),
    );
  } catch (error) {
    logger.error(`Vision maker crashed: ${error}`);
    throw new PipelineException(`Vision maker crashed: ${error}`);
  }
};

export const reRank = async (query: string, initalResult: string[]) => {
  try {
    const rerank = await embedding().rerank({
      query: query,
      documents: initalResult,
      model: "rerank-2",
      topK: 5,
    });
    logger.info(`Query has been reranked sucessfully`);
    return rerank;
  } catch (error) {
    logger.error(`Reranking functionality has been crashed: ${error}`);
    throw new PipelineException(
      `Reranking functionality has been crashed: ${error}`,
    );
  }
};

export const mem0Search = async (mem0: mem0RequestSearch) => {
  try {
    const _mem0Search = await memoClient.search(mem0.message, {
      user_id: mem0.userId,
      ...(mem0.sessionId ? { sessionId: mem0.sessionId } : {}),
      limit: mem0Limit,
    });
    const mem0Res = _mem0Search.map((msg) =>
      msg.memory ? msg.messages?.map((m) => m.content).join("\n") : msg.memory,
    );
    logger.info(`memo searching the context in the memory`);
    return mem0Res;
  } catch (error) {
    logger.error(`Memory Agents failed while searching: ${error}`);
    throw new RetrivalExecption(
      `Memory Agents failed while searching: ${error}`,
    );
  }
};

export const mem0Add = async (mem0: mem0RequestAdd) => {
  try {
    await memoClient.add(
      [
        { role: "user", content: mem0.message },
        { role: "assistant", content: mem0.response },
      ],
      {
        user_id: mem0.userId,
        ...(mem0.sessionId ? { session_id: mem0.sessionId } : {}),
      },
    );
    logger.info(`Memory context has been saved to [LTM: MME0] `);
    return true;
  } catch (error) {
    logger.error(`Memory Agents failed while adding: ${error}`);
    throw new RetrivalExecption(`Memory Agents failed while adding: ${error}`);
  }
};

export async function* streamCollector(
  res: Promise<Stream<ChatCompletionChunk> & { _request_id?: string | null }>,
  onFinish: (finalText: string) => Promise<void>,
) {
  let fullContent: string = "";
  try {
    const _context = await res;
    logger.info(`Streaming has been started..`);
    for await (const chunk of _context) {
      const content = chunk.choices[0].delta?.content || "";
      fullContent += content;
      yield chunk;
    }
    await onFinish(fullContent);
  } catch (error) {
    logger.error(`Stream collector failed : ${error}`);
    throw new RetrivalExecption(`Stream collector failed : ${error}`);
  }
}
