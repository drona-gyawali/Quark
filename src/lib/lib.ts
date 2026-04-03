import { t } from "elysia";
import type { Context, Static } from "elysia";
import type { User } from "@supabase/supabase-js";

export const IngestionSchema = t.Object({
  key: t.String(),
  filename: t.String(),
  session_id: t.String(),
});

export type IngestionHelper = Static<typeof IngestionSchema>;

export const KeySchema = t.Object({
  filename: t.String(),
  contentType: t.String(),
  contentSize: t.Number(),
});

export type Key = Static<typeof KeySchema>;

export const ChatViewSchema = t.Object({
  sessionId: t.String(),
  page: t.Number(),
  limit: t.Number(),
});

export type ChatView = Static<typeof ChatViewSchema>;

export type AuthContext = Context & { user: User | null };
