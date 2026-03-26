
import {t, type Static} from "elysia"

export const IngestionSchema = t.Object({
    key: t.String(),
    filename: t.String(),
    session_id: t.String(),
    tags: t.Object({})
})

export type IngestionHelper = Static<typeof IngestionSchema>

export  const KeySchema = t.Object( {
    filename:t.String(),
    user_id:t.String(),
    contentType:t.String(),
    contentSize:t.Number()
})


export type Key = Static<typeof KeySchema>

export const ChatViewSchema  = t.Object({
    sessionId:t.String(),
    page:t.Number(),
    limit:t.Number(),
})

export type ChatView = Static<typeof ChatViewSchema>