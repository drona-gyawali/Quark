import { EmbedRequestInputType } from "voyageai";

export function generateEmbedding(
  input: string,
  inputType: EmbedRequestInputType,
): Promise<number[]>;
export function generateEmbedding(
  input: string[],
  inputType: EmbedRequestInputType,
): Promise<number[][]>;
