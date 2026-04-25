export interface DocumentElement {
  element_id: string;
  type: string;
  text?: string;
  metadata?: {
    image_url?: string;
    [key: string]: any;
  };
}

type PartialDocumentElement = Partial<DocumentElement>;

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

export type VisionResult = {
  doc_id: string;
  images: {
    page: number;
    s3_key: string;
  }[];
};
