import type { RerankResponseDataItem } from "voyageai";
import { vector } from "../conf/conf.ts";
import { DatabaseExecption } from "./exec.ts";
import type { Tags } from "./pipeline.js";
import { reRank } from "./utils.ts";
import { logger } from "../conf/logger.ts";

export const ensureCollectionExists = async (collectionName: string) => {
  try {
    const collections = await vector().getCollections();
    const exists = collections.collections.some(
      (c) => c.name === collectionName,
    );

    if (!exists) {
      logger.debug(`[QDRANT]: Creating new collection: ${collectionName}`);

      await vector().createCollection(collectionName, {
        vectors: {
          size: 1024,
          distance: "Cosine",
        },

        optimizers_config: {
          default_segment_number: 2,
        },
      });
    }
  } catch (error) {
    throw new DatabaseExecption(
      `Failed to ensure collection exists : ${error}`,
    );
  }
};

export const dumpToDb = async (collectionName: string, batchRecords: any[]) => {
  try {
    await vector().upsert(collectionName, {
      wait: true,
      points: batchRecords.map((rec) => ({
        id: rec.id,
        vector: rec.vector,
        payload: {
          text: rec.text,
          ...rec.metadata,
        },
      })),
    });
    logger.debug(`[QDRANT]: Saved ${batchRecords.length} points.`);
  } catch (error) {
    throw new DatabaseExecption(`Qdrant Upsert Failed: ${error}`);
  }
};

export const getRelevantContext = async (
  filters: Tags,
  collectionName: string,
  query: string,
  queryVector: number[],
  limit: number,
) => {
  logger.debug(`Filters: ${filters}`);
  logger.debug(`Vector size: ${queryVector.length}`);
  logger.debug(`Collection: ${collectionName}`);
  try {
    const results = await vector().search(collectionName, {
      vector: queryVector,
      limit: limit,
      // TODO: we might be benefit using filter for better reterival...
      with_payload: true,
    });

    const doc = results.map((hit) => ({
      text: hit.payload?.text as string,
      score: hit.score,
      page: hit.payload?.page_number || hit.payload?.pageNumber,
      isVisual: hit.payload?.isVisual === true || hit.payload?.type === "Image",
      // TODO: S3 intergration to show the image in ui.
      imageUrl: hit.payload?.imageUrl || null,
    }));
    const docText = doc.map((d) => d.text);
    const reRankedRes = await reRank(query, docText);

    if (!reRankedRes?.data) {
      throw new DatabaseExecption(
        `Error occured while processing reranking startegy ${reRankedRes}`,
      );
    }

    const optimizedRes = reRankedRes.data.map(
      (item: RerankResponseDataItem) => {
        const orgDoc = doc[item.index as number];
        return {
          ...orgDoc,
          score: item.relevanceScore,
        };
      },
    );

    return optimizedRes;
  } catch (error) {
    throw new DatabaseExecption(
      `Error occured while processing the response from db ${error}`,
    );
  }
};
