import type { S3 } from "@aws-sdk/client-s3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { storage, env } from "../conf/conf.ts";
import { generateKey } from "./utils.ts";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  SIGNED_URL_EXPIRES,
  ALLOWED_SIZE,
  ALLOWED_TYPES,
} from "../conf/const.ts";
import { StorageException } from "../conf/exec.ts";
import { logger } from "../conf/logger.ts";
import type { Key } from "../lib/lib.js";

export const createPresignedUrl = async (genKey: Key) => {
  try {
    if (genKey.contentSize > ALLOWED_SIZE) {
      logger.error("Maximum file size limit exceed");
      return { SizeError: "Maximum file size limit exceed" };
    }

    if (!ALLOWED_TYPES.includes(genKey.contentType)) {
      logger.error(`Invalid File Type | Valid Type Are: ${ALLOWED_TYPES}`);
      return {
        TypeError: `Invalid File Type | Valid Type Are: ${ALLOWED_TYPES}`,
      };
    }

    const key = generateKey(genKey);
    const command = new PutObjectCommand({
      Bucket: env.OBJECT_NAME,
      Key: key,
    });
    const s3Client = storage() as S3;
    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: SIGNED_URL_EXPIRES,
    });
    return { signedUrl, key };
  } catch (error) {
    logger.error(`Error occured while generating prsigned Url ${error}`);
    throw new StorageException(
      `Error occured while generating prsigned Url ${error}`,
    );
  }
};

export const getFile = async (key: string) => {
  try {
    const command = new GetObjectCommand({
      Bucket: env.OBJECT_NAME,
      Key: key,
    });
    const s3Client = storage() as S3;
    const response = await s3Client.send(command);
    if (!response?.Body) {
      logger.error(
        `File is not present with following key ${key} in storage: ${response}`,
      );
      throw new StorageException(
        `File is not present with following key ${key} in storage ${response}`,
      );
    }

    const byteArray = await response.Body.transformToByteArray();
    const bufferFile = Buffer.from(byteArray);
    const metadata = response.Metadata;
    logger.info(`fetching file from Oject : ${metadata}`);
    return { bufferFile, metadata };
  } catch (error) {
    logger.error(`Error occured while downloading file: ${error}`);
    throw new StorageException(
      `Error occured while downloading file: ${error}`,
    );
  }
};
