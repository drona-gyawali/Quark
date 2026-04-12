export interface DocumentElement {
  element_id: string;
  type: string;
  text?: string;
  metadata?: {
    image_base64?: string;
    [key: string]: any;
  };
}

export interface PartitionOutput {
  elements: DocumentElement[];
}

export interface IngestionResult {
  success: boolean;
  totalChunks: number;
  visualChunks: number;
}

export interface mem0RequestSearch {
  message: string;
  userId?: string;
  sessionId?: string;
}

export interface mem0RequestAdd extends mem0RequestSearch {
  query: string;
  response: string;
}

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  timestamp?: number;
}
