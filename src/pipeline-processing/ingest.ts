import {
  partitionDocument,
  describeVisualElements,
  processMetadata,
  visionMaker,
} from "./utils.ts";

import type { IngestionResult } from "./pipeline.ts";
import { PipelineException } from "./exec.ts";
import { getLocalImages } from "./vision-bridge.ts";
import { logger } from "../conf/logger.ts";

export const ingestDocument = async (
  fileBuffer: Buffer,
  fileName: string,
): Promise<IngestionResult> => {
  try {
    logger.debug("[INGESTION] Starting document ingestion...");

    const [raw, visionResult] = await Promise.all([
      partitionDocument(fileBuffer, fileName),
      getLocalImages(fileBuffer),
    ]);

    const imageCounts = visionResult.images.reduce(
      (acc: Record<number, number>, img) => {
        acc[img.page] = (acc[img.page] || 0) + 1;
        return acc;
      },
      {},
    );

    logger.debug(
      `[DEBUG] Images extracted per page: ${JSON.stringify(imageCounts)}`,
    );

    logger.debug(
      `[DEBUG] visionMaker received ${raw.length} elements and ${visionResult.images.length} images`,
    );

    const finalElements = visionMaker(raw, visionResult, fileName);

    const assignedCount = finalElements.filter(
      (e) => e.metadata?.image_url,
    ).length;

    logger.debug(
      `[DEBUG] Final elements after visionMaker: ${finalElements.length}, with image_url: ${assignedCount}`,
    );

    // TODO: we can reduce cost if we batch here
    const enriched = await describeVisualElements(finalElements);

    const visualCount = enriched.filter(
      (el) => el.metadata?.visual_description,
    ).length;

    logger.debug(`[INGESTION] Processed ${visualCount} visual elements`);

    await processMetadata(enriched);

    logger.debug("[INGESTION] Completed successfully");

    return {
      success: true,
      totalChunks: enriched.length,
      visualChunks: visualCount,
    };
  } catch (error: any) {
    logger.error("[INGESTION ERROR]:", error);
    logger.error(error.stack);
    throw new PipelineException(`Document ingestion failed: ${String(error)}`);
  }
};
