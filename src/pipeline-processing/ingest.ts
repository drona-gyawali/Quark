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

    const [raw, localImages] = await Promise.all([
      partitionDocument(fileBuffer, fileName),
      getLocalImages(fileName),
    ]);
    const finalElements = visionMaker(raw, localImages, fileName);

    const enriched = await describeVisualElements(finalElements);
    logger.debug(enriched);
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
