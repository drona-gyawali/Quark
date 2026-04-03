import { randomUUID } from "node:crypto";
import type { Key } from "../lib/lib.ts";
import { basename } from "node:path";

export const generateKey = (key: Key, userId: string) => {
  const uid = randomUUID();
  const safeFilename = basename(key.filename).replace(/[^\w.-]/g, "_");
  return `${userId}-${uid}/${safeFilename}`;
};
