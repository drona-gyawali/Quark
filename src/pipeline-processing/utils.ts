import { Strategy } from "unstructured-client/sdk/models/shared";
import { MAXCHAR, BATCHSIZE, limit, mem0Limit } from "./consts.ts";
import { PipelineException, RetrivalExecption } from "./exec.ts";
import { unstructured, env, embedding, memoClient } from "../conf/conf.ts";
import {
  getStaticPrompt,
  isBase64,
  llmResponse,
  prepareBatchRecords,
  htmlTableToMarkdown,
  sleep,
  isDocumentElement,
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

//
export const describeVisualElements = async (
  elements: DocumentElement[],
): Promise<DocumentElement[]> => {
  try {
    const processed = await Promise.all(
      elements.map((ele) =>
        limit(async () => {
          const base64Image = ele.metadata?.image_base64;
          const tableHtml = ele.metadata?.text_as_html;

          if (base64Image && typeof base64Image === "string") {
            try {
              isBase64(base64Image, ele);

              const promptType = ele.type === "Table" ? "Table" : "Image";
              const description = await llmResponse(
                base64Image,
                getStaticPrompt(promptType),
              );

              return {
                ...ele,
                text: `${ele.text}\n\n[Visual Analysis]: ${description}`,
                metadata: {
                  ...ele.metadata,
                  // TODO: s3 layer will save the image metadata.image.url ui stuff
                  image_base64: "",
                  visual_description: description.substring(0, 500),
                },
              };
            } catch (err) {
              logger.error(
                `[VISION ERROR] LLM failed for element ${ele.element_id} : ${err}`,
              );
              return ele;
            }
          }

          if (tableHtml) {
            try {
              logger.debug(
                `[TABLE] Converting HTML to Markdown: ${ele.element_id}`,
              );
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
                `[HTML-MD ERROR] Failed for ${ele.element_id} : ${mdErr}`,
              );
              return ele;
            }
          }

          return ele;
        }),
      ),
    );

    return processed;
  } catch (error: any) {
    throw new PipelineException(`Visual processing failed: ${error.message}`);
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
  localImages: Record<number, string[]>,
  fileName: string,
) => {
  try {
    if (typeof raw === "string") {
      throw new PipelineException("Unexpected string response from partition");
    }
    if (!Array.isArray(raw)) {
      throw new PipelineException("Partition did not return array of elements");
    }
    if (!raw.every(isDocumentElement)) {
      throw new PipelineException(
        "Partition returned invalid element structure",
      );
    }
    const elements: DocumentElement[] = raw.map((ele: any) => {
      const pageNum = ele.metadata?.page_number;
      // TODO: personally i am not ok with this compositeElement stuff i want soemthing more reliable way.
      if (
        ele.type === "CompositeElement" &&
        localImages[pageNum] &&
        localImages[pageNum].length > 0
      ) {
        return {
          ...ele,
          metadata: {
            ...ele.metadata,
            image_base64: localImages[pageNum].shift(),
          },
        };
      }
      return ele;
    });

    Object.entries(localImages).forEach(([page, imagesLeft]) => {
      const pageNum = parseInt(page);

      // If there are still images left for this page (either Unstructured missed the page
      // or there were more images than text blocks), add them as new elements.
      if (!Array.isArray(imagesLeft) || imagesLeft.length === 0) return;
      imagesLeft.forEach((base64, idx) => {
        elements.push({
          type: "Image",
          element_id: `manual-p${pageNum}-${idx}`,
          text: "",
          metadata: {
            page_number: pageNum,
            image_base64: base64,
            filename: fileName,
          },
        });
      });
    });

    const finalElements = elements.sort(
      (a, b) => (a.metadata?.page_number || 0) - (b.metadata?.page_number || 0),
    );
    return finalElements;
  } catch (error) {
    throw new PipelineException(`Vision maker has been crashed : ${error}`);
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
    return rerank;
  } catch (error) {
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
    return mem0Res;
  } catch (error) {
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
    return true;
  } catch (error) {
    throw new RetrivalExecption(`Memory Agents failed while adding: ${error}`);
  }
};
