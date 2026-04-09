import { ingestDocument } from "../pipeline-processing/ingest.ts";
import { retriveContext } from "../pipeline-processing/retrival.ts";
import { updateIngestLog } from "../service/ingest.ts";
import { APIException, SuperBaseException } from "../conf/exec.ts";
import { getFile } from "../service/object.ts";
import { logger } from "../conf/logger.ts";
import { type IngestionHelper } from "../lib/lib.ts";
import type {
  mem0RequestAdd,
  mem0RequestSearch,
  RetrivalRequest,
} from "../pipeline-processing/pipeline.js";
import { dumpChatHistory } from "../service/chat.ts";
import { db } from "../lib/superbase.ts";
import { randomUUID } from "node:crypto";

export const ingestion_helper = async (
  ingest: IngestionHelper,
  ingest_id: string,
) => {
  try {
    const { bufferFile, metadata } = await getFile(ingest.key);
    if (!bufferFile) {
      logger.error(`Error occured in ingestion API ${bufferFile}`);
      throw new APIException(`Error occured in ingestion API ${bufferFile}`);
    }
    const _docIngest = await ingestDocument(bufferFile, ingest.filename);
    if (!_docIngest) {
      logger.error(`Error occured in ingestion API ${_docIngest}`);
      throw new APIException(`Error occured in ingestion API ${_docIngest}`);
    }
    const logDb = await updateIngestLog(
      {
        chunks: _docIngest.totalChunks,
        visual_chunks: _docIngest.visualChunks,
        metadata: metadata,
      },
      ingest_id,
    );
    return { id: logDb.id };
  } catch (error) {
    logger.error(`Error occured in ingesion API : ${error}`);
    return { error: error };
  }
};

export const retriver_helper = async (
  retrive: RetrivalRequest,
  search: mem0RequestSearch,
  add: mem0RequestAdd,
) => {
  const { sessionId, message: userText } = retrive;
  dumpChatHistory({
    session_id: String(sessionId),
    role: "user",
    content: userText,
  }).catch((err) => logger.error(`Background User Log Failed: ${err}`));

  try {
    const res = await retriveContext(retrive, search, add);
    const assistantAnswer = res.answer;

    dumpChatHistory({
      session_id: String(sessionId),
      role: "assistant",
      content: assistantAnswer,
    }).catch((err) => logger.error(`Background Assistant Log Failed: ${err}`));

    return res;
  } catch (error: any) {
    const errorMsg = error?.message ?? String(error);

    dumpChatHistory({
      session_id: String(sessionId),
      role: "system",
      content: `Pipeline Error: ${errorMsg}`,
    }).catch((err) => logger.error(`Background Error Log Failed: ${err}`));

    throw error;
  }
};

export const me = async (userId: string) => {
  try {
    const { data, error } = await db
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) {
      logger.error(`User Profile had a error: ${error}`);
      throw new SuperBaseException(
        `User Profile had a error: ${error.message}`,
      );
    }
    return data;
  } catch (error) {
    logger.error(`User Profile had a error: ${error}`);
    throw new SuperBaseException(`User Profile had a error: ${error}`);
  }
};

export const generateJobId = (fileName: string) => {
  const uid = randomUUID();
  const _filename = fileName.trim();
  return `${uid}/${_filename}`;
};
