import pLimit from "p-limit";
import prompts from "./prompts.json" with { type: "json" };

export const MAXCHAR: number = 1500;
export const BATCHSIZE: number = 12;
export const limit = pLimit(3);
export const SIMILARITY_THRESHOLD = 0.2;
export const VECTOR_LIMIT = 15;
export const mem0Limit = 5;
export const STM_PREFIX = "stm:";
export const MAX_MESSAGES = 20;
export const TRIM_TO = 5;
export const TTL_SECONDS = 1800;

export const DIAGRAM_TEXT = prompts.analysis.diagram;
export const TABLE_TEXT = prompts.analysis.table;
