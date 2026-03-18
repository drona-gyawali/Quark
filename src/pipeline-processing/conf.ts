import dotenv from "dotenv";
import { UnstructuredClient } from "unstructured-client";
import { ClientException } from "./exec.ts";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";
import { VoyageAIClient } from "voyageai";
import { MemoryClient } from "mem0ai";
import { createClient } from "redis";
import { z } from "zod";
import { logger } from "../conf/logger.ts";

dotenv.config();

/* 
    Centralizing the ENV variable for overall pipline system.
*/
const envSchema = z.object({
  // Environment Metadata
  ENV: z.enum(["dev", "staging", "prod"]).default("dev"),

  // LLM Configuration
  LLM_TOKEN: z.string().min(1, "LLM_TOKEN is required"),
  LLM_URL: z.string().url("LLM_URL must be a valid URL"),
  LLM_MODEL: z.string().default("meta-llama/llama-4-scout-17b-16e-instruct"),

  // Embedding Configuration
  EMBEDDING_TOKEN: z.string().min(1, "EMBEDDING_TOKEN is required"),
  EMBEDDING_MODEL: z.string().default("voyage-4-large"),

  // Unstructured (Document Partitioning)
  UNSTRUCTURED_TOKEN: z.string().min(1),
  UNSTRUCTURED_URL: z.string().url(),

  // Vector Database (e.g., Qdrant/Pinecone)
  VECTOR_DB_TOKEN: z.string().min(1),
  VECTOR_DB_URL: z.string().url(),
  COLLECTION_NAME: z.string().min(1),

  // Memory & Cache
  MEM0_API: z.string().optional(),
  REDIS_URL: z.string().url(),
});

// Parse process.env and export the validated object
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  logger.error(`Invalid environment variables: ${parsedEnv.error.format()}`);
  process.exit(1);
}

logger.debug(`Env Variable Injected Successfully`);

export const env = parsedEnv.data;

// modes of learning
export enum Mode {
  EXAM = "EXAM",
  SELFLEARNING = "SELFLEARNING",
  DEEPLEARNING = "DEEPLEARNING",
  CASUALEARNING = "CASUALEARNING",
}

/*
    This is the connection setup for the overall pipeline system.
*/

export function unstructured(): UnstructuredClient {
  try {
    const conn = new UnstructuredClient({
      serverURL: env.UNSTRUCTURED_URL,
      security: {
        apiKeyAuth: env.UNSTRUCTURED_TOKEN,
      },
    });

    if (!conn) {
      throw new ClientException(
        "Connection problem in unstructred - Check your API key",
      );
    }
    return conn;
  } catch (error) {
    throw new ClientException(
      `Connection problem in unstructred: ${error as unknown}`,
    );
  }
}

export function vector(): QdrantClient {
  try {
    const client = new QdrantClient({
      url: env.VECTOR_DB_URL,
      apiKey: env.VECTOR_DB_TOKEN,
    });

    return client;
  } catch (error) {
    throw new ClientException(
      `Connection problem in QdrantClient: ${error as unknown}`,
    );
  }
}

export function llm(): OpenAI {
  try {
    const conn = new OpenAI({
      apiKey: env.LLM_TOKEN,
      baseURL: env.LLM_URL,
    });

    return conn;
  } catch (error) {
    throw new ClientException(
      `Connection problem in OpenAI: ${error as unknown}`,
    );
  }
}

export function embedding(): VoyageAIClient {
  try {
    const client = new VoyageAIClient({
      apiKey: env.EMBEDDING_TOKEN,
    });

    return client;
  } catch (error) {
    throw new ClientException(
      `Connection problem in OpenAI: ${error as unknown}`,
    );
  }
}

export const memoClient = new MemoryClient({ apiKey: env.MEM0_API ?? "" });

export const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redis.on("error", (err) => {
  logger.error("Redis error:", err);
});

export const connectRedis = async () => {
  if (!redis.isOpen) {
    await redis.connect();
  }
};

await connectRedis();
