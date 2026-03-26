import { randomUUID } from "node:crypto"
import type { Key } from "../lib/lib.ts"

export const generateKey = (key:Key) => {
    const rdmUid = randomUUID().substring(1,5)
    const _key = `${key.user_id}-${rdmUid}/${key.filename}`
    return _key
}
