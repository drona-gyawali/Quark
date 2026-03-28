import { randomUUID } from "node:crypto";
import type { Key } from "../lib/lib.ts";
import { basename } from "node:path";

export const generateKey = (key: Key) => {
  const uid = randomUUID();
  const safeFilename = basename(key.filename).replace(/[^\w.-]/g, "_");
  return `${key.user_id}-${uid}/${safeFilename}`;
};
