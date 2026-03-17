import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./conf.ts", () => ({
  llm: vi.fn(),
  env: { LLM_MODEL: "gpt-4o" },
  redis: {
    rPush: vi.fn(),
    lTrim: vi.fn(),
    expire: vi.fn(),
    lRange: vi.fn(),
  },
}));

vi.mock("./consts.ts", () => ({
  DIAGRAM_TEXT: "DIAGRAM_PROMPT",
  TABLE_TEXT: "TABLE_PROMPT",
  STM_PREFIX: "stm:",
  MAX_MESSAGES: 10,
  TTL_SECONDS: 3600,
  TRIM_TO: 5,
}));

vi.mock("./exec.ts", () => ({
  ClientException: class ClientException extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "ClientException";
    }
  },
  PipelineException: class PipelineException extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "PipelineException";
    }
  },
}));

vi.mock("./prompts.json", () => ({
  default: {
    templates: {
      tutorResponse:
        "Institution: {{institution}}\nContext: {{contextString}}\nMessage: {{message}}",
      Summarize: "Summarize:\n{{conversation}}",
    },
  },
}));

vi.mock("../conf/logger.ts", () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("marked", () => ({
  marked: vi.fn(async (html: string) => `<p>${html}</p>`),
}));

import {
  getStaticPrompt,
  isDocumentElement,
  htmlTableToMarkdown,
  isBase64,
  llmResponse,
  prepareBatchRecords,
  sleep,
  contextString,
  resolveTemplate,
  Response,
  summarizeResponse,
  addSTMMessage,
  getSTM,
  stmContext,
  trimSTM,
  handleMemoryCompression,
} from "./helpers.ts";

import { redis } from "./conf.ts";
import { llm } from "./conf.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal valid PNG base64 prefix padded to >200 chars */
const makeFakeBase64 = (prefix: string, length = 250) =>
  prefix + "A".repeat(length - prefix.length);

const PNG_B64 = makeFakeBase64("iVBORw0KGgo");
const JPEG_B64 = makeFakeBase64("/9j/");
const GIF_B64 = makeFakeBase64("R0lGOD");
const WEBP_B64 = makeFakeBase64("UklGR");
const UNKNOWN_B64 = makeFakeBase64("XXXXXX"); // unknown type → falls back to jpeg

// ─── getStaticPrompt ──────────────────────────────────────────────────────────

describe("getStaticPrompt", () => {
  it("returns DIAGRAM_TEXT for 'Image'", () => {
    expect(getStaticPrompt("Image")).toBe("DIAGRAM_PROMPT");
  });

  it("returns TABLE_TEXT for any other type", () => {
    expect(getStaticPrompt("Table")).toBe("TABLE_PROMPT");
    expect(getStaticPrompt("Text")).toBe("TABLE_PROMPT");
    expect(getStaticPrompt("")).toBe("TABLE_PROMPT");
  });
});

describe("isDocumentElement", () => {
  it("returns true for a valid DocumentElement", () => {
    expect(isDocumentElement({ type: "Text", text: "hello" })).toBe(true);
  });

  it("returns false when type is missing", () => {
    expect(isDocumentElement({ text: "hello" })).toBe(false);
  });

  it("returns false when text is missing", () => {
    expect(isDocumentElement({ type: "Text" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isDocumentElement(null)).toBe(false);
  });

  it("returns false for a primitive", () => {
    expect(isDocumentElement("string")).toBe(false);
    expect(isDocumentElement(42)).toBe(false);
  });

  it("returns false when type is not a string", () => {
    expect(isDocumentElement({ type: 1, text: "hi" })).toBe(false);
  });

  it("returns false when text is not a string", () => {
    expect(isDocumentElement({ type: "Text", text: 123 })).toBe(false);
  });
});

describe("htmlTableToMarkdown", () => {
  it("converts html to markdown via marked", async () => {
    const result = await htmlTableToMarkdown("<table>hello</table>");
    expect(result).toContain("hello");
  });
});

describe("isBase64", () => {
  const ele = { element_id: "test-001" };

  it("returns false when string is shorter than 200 chars", () => {
    expect(isBase64("iVBORw0KGgoShort", ele)).toBe(false);
  });

  it("returns true for PNG base64", () => {
    expect(isBase64(PNG_B64, ele)).toBe(true);
  });

  it("returns true for JPEG base64", () => {
    expect(isBase64(JPEG_B64, ele)).toBe(true);
  });

  it("returns true for GIF base64", () => {
    expect(isBase64(GIF_B64, ele)).toBe(true);
  });

  it("returns true for WEBP base64", () => {
    expect(isBase64(WEBP_B64, ele)).toBe(true);
  });

  it("returns false for unknown base64 header (even if long enough)", () => {
    expect(isBase64(UNKNOWN_B64, ele)).toBe(false);
  });
});

describe("llmResponse", () => {
  const mockCreate = vi.fn();

  beforeEach(() => {
    vi.mocked(llm).mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as any);
  });

  afterEach(() => vi.clearAllMocks());

  it("throws ClientException when message is empty", async () => {
    await expect(llmResponse(undefined, "")).rejects.toThrow(
      "Prompt/message cannot be empty",
    );
    await expect(llmResponse(undefined, "   ")).rejects.toThrow(
      "Prompt/message cannot be empty",
    );
  });

  it("throws ClientException when message is undefined", async () => {
    await expect(llmResponse(undefined, undefined)).rejects.toThrow(
      "Prompt/message cannot be empty",
    );
  });

  it("makes a text-only LLM call when no image is provided", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "text answer" } }],
    });

    const result = await llmResponse(undefined, "What is 2+2?");
    expect(result).toBe("text answer");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "What is 2+2?" }],
      }),
    );
  });

  it("makes a vision LLM call when a valid image is provided", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "image answer" } }],
    });

    const result = await llmResponse(PNG_B64, "Describe this image");
    expect(result).toBe("image answer");

    const call = mockCreate.mock.calls[0][0];
    const content = call.messages[0].content;
    expect(content[0]).toEqual({ type: "text", text: "Describe this image" });
    expect(content[1].type).toBe("image_url");
    expect(content[1].image_url.url).toContain("image/png");
    expect(content[1].image_url.url).toContain(PNG_B64);
  });

  it("detects correct mime types for each base64 prefix", async () => {
    const cases: [string, string][] = [
      [PNG_B64, "image/png"],
      [JPEG_B64, "image/jpeg"],
      [GIF_B64, "image/gif"],
      [WEBP_B64, "image/webp"],
      [UNKNOWN_B64, "image/jpeg"], // fallback
    ];

    for (const [b64, expectedMime] of cases) {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "ok" } }],
      });
      await llmResponse(b64, "prompt");
      const call = mockCreate.mock.calls.at(-1)![0];
      const url: string = call.messages[0].content[1].image_url.url;
      expect(url).toContain(expectedMime);
    }
  });

  it("treats a short base64 string as no image (text-only call)", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "text only" } }],
    });

    await llmResponse("iVBORshort", "some prompt");
    const call = mockCreate.mock.calls[0][0];
    // Should be text-only (content is a string, not an array)
    expect(typeof call.messages[0].content).toBe("string");
  });

  it("throws ClientException when LLM returns empty content", async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: "" } }] });
    await expect(llmResponse(undefined, "hello")).rejects.toThrow(
      "LLM returned empty or null content",
    );
  });

  it("throws ClientException wrapping API errors", async () => {
    mockCreate.mockRejectedValue(new Error("network timeout"));
    await expect(llmResponse(undefined, "hello")).rejects.toThrow(
      "LLM request failed: network timeout",
    );
  });

  it("logs raw API response when error has a response property", async () => {
    const errWithResponse = Object.assign(new Error("api failed"), {
      response: { status: 429, body: "rate limited" },
    });
    mockCreate.mockRejectedValue(errWithResponse);

    await llmResponse(undefined, "hello").catch(() => {});

    const { logger } = await import("../conf/logger.ts");
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Raw API response"),
    );
  });
});

describe("prepareBatchRecords", () => {
  const tags = { mode: "study", institution: "MIT", courseName: "6.006" };
  const elements = [
    { text: "hello", type: "Text", metadata: { page: 1 } },
    { text: "diagram", type: "Image", metadata: { page: 2 } },
  ];
  const vectors = [
    [0.1, 0.2],
    [0.3, 0.4],
  ];

  it("returns one record per element", () => {
    const records = prepareBatchRecords(elements, vectors, tags, 0);
    expect(records).toHaveLength(2);
  });

  it("attaches correct vector to each record", () => {
    const records = prepareBatchRecords(elements, vectors, tags, 0);
    expect(records[0].vector).toEqual([0.1, 0.2]);
    expect(records[1].vector).toEqual([0.3, 0.4]);
  });

  it("sets chunkIndex correctly based on startIndex", () => {
    const records = prepareBatchRecords(elements, vectors, tags, 5);
    expect(records[0].metadata.chunkIndex).toBe(5);
    expect(records[1].metadata.chunkIndex).toBe(6);
  });

  it("marks isVisual true for Image and Table types", () => {
    const mixed = [
      { text: "t", type: "Image", metadata: {} },
      { text: "t", type: "Table", metadata: {} },
      { text: "t", type: "Text", metadata: {} },
    ];
    const vecs = [[0], [0], [0]];
    const records = prepareBatchRecords(mixed, vecs, tags, 0);
    expect(records[0].metadata.isVisual).toBe(true);
    expect(records[1].metadata.isVisual).toBe(true);
    expect(records[2].metadata.isVisual).toBe(false);
  });

  it("spreads tags into metadata", () => {
    const records = prepareBatchRecords(elements, vectors, tags, 0);
    expect(records[0].metadata.mode).toBe("study");
    expect(records[0].metadata.institution).toBe("MIT");
    expect(records[0].metadata.courseName).toBe("6.006");
  });

  it("assigns a unique UUID id to each record", () => {
    const records = prepareBatchRecords(elements, vectors, tags, 0);
    expect(records[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(records[0].id).not.toBe(records[1].id);
  });

  it("throws PipelineException on error", () => {
    expect(() => prepareBatchRecords(null as any, vectors, tags, 0)).toThrow(
      "Error preparing batch records",
    );
  });
});

describe("sleep", () => {
  it("resolves after approximately the given ms", async () => {
    vi.useFakeTimers();
    const p = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe("contextString", () => {
  it("formats candidates with correct labels", () => {
    const candidates = [
      { isVisual: false, page: 1, text: "Intro paragraph" },
      { isVisual: true, page: 3, text: "A chart" },
    ];
    const result = contextString(candidates);
    expect(result).toContain("[Source 1 | TEXT | Page 1]");
    expect(result).toContain("Intro paragraph");
    expect(result).toContain("[Source 2 | VISUAL/DIAGRAM | Page 3]");
    expect(result).toContain("A chart");
    expect(result).toContain("---");
  });

  it("returns empty string for empty array", () => {
    expect(contextString([])).toBe("");
  });
});

describe("resolveTemplate", () => {
  it("replaces known placeholders", () => {
    const tpl = "Hello {{name}}, you are {{age}} years old.";
    expect(resolveTemplate(tpl, { name: "Alice", age: "30" })).toBe(
      "Hello Alice, you are 30 years old.",
    );
  });

  it("leaves unknown placeholders unchanged", () => {
    const tpl = "Hello {{name}} {{unknown}}";
    expect(resolveTemplate(tpl, { name: "Bob" })).toBe("Hello Bob {{unknown}}");
  });

  it("returns the template unchanged when data is empty", () => {
    const tpl = "No placeholders here.";
    expect(resolveTemplate(tpl, {})).toBe("No placeholders here.");
  });

  it("replaces multiple occurrences of the same placeholder", () => {
    const tpl = "{{x}} and {{x}}";
    expect(resolveTemplate(tpl, { x: "Y" })).toBe("Y and Y");
  });
});

describe("Response", () => {
  it("injects institution, contextString, and message into the template", () => {
    const result = Response(
      "ctx data",
      { institution: "Harvard" },
      "What is ML?",
    );
    expect(result).toContain("Harvard");
    expect(result).toContain("ctx data");
    expect(result).toContain("What is ML?");
  });
});

describe("summarizeResponse", () => {
  it("injects conversation into the Summarize template", () => {
    const result = summarizeResponse("user: hi\nassistant: hello");
    expect(result).toContain("user: hi");
    expect(result).toContain("assistant: hello");
  });
});

describe("addSTMMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pushes the message as JSON to the correct redis key", async () => {
    await addSTMMessage("sess-1", { role: "user", content: "hello" });

    expect(vi.mocked(redis.rPush)).toHaveBeenCalledWith(
      "stm:sess-1",
      expect.stringContaining('"role":"user"'),
    );
  });

  it("adds a timestamp to the message", async () => {
    await addSTMMessage("sess-1", { role: "assistant", content: "hi" });
    const pushed: string = vi.mocked(redis.rPush).mock.calls[0][1] as string;
    const parsed = JSON.parse(pushed);
    expect(parsed.timestamp).toBeDefined();
    expect(typeof parsed.timestamp).toBe("number");
  });

  it("trims the list to MAX_MESSAGES", async () => {
    await addSTMMessage("sess-1", { role: "user", content: "msg" });
    expect(vi.mocked(redis.lTrim)).toHaveBeenCalledWith("stm:sess-1", -10, -1);
  });

  it("sets TTL on the key", async () => {
    await addSTMMessage("sess-1", { role: "user", content: "msg" });
    expect(vi.mocked(redis.expire)).toHaveBeenCalledWith("stm:sess-1", 3600);
  });
});

describe("getSTM", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns parsed ChatMessage array from redis", async () => {
    vi.mocked(redis.lRange).mockResolvedValue([
      JSON.stringify({ role: "user", content: "hello", timestamp: 1 }),
      JSON.stringify({ role: "assistant", content: "hi", timestamp: 2 }),
    ]);

    const result = await getSTM("sess-2");
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[1].content).toBe("hi");
  });

  it("returns empty array when no messages exist", async () => {
    vi.mocked(redis.lRange).mockResolvedValue([]);
    const result = await getSTM("sess-empty");
    expect(result).toEqual([]);
  });

  it("queries the correct redis key", async () => {
    vi.mocked(redis.lRange).mockResolvedValue([]);
    await getSTM("sess-abc");
    expect(vi.mocked(redis.lRange)).toHaveBeenCalledWith("stm:sess-abc", 0, -1);
  });
});

describe("stmContext", () => {
  it("joins messages as 'role: content' lines", () => {
    const msgs = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];
    expect(stmContext(msgs)).toBe("user: hello\nassistant: world");
  });

  it("returns empty string for empty array", () => {
    expect(stmContext([])).toBe("");
  });
});

describe("trimSTM", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trims the list to TRIM_TO from the end", async () => {
    await trimSTM("sess-3");
    expect(vi.mocked(redis.lTrim)).toHaveBeenCalledWith("stm:sess-3", -5, -1);
  });
});

describe("handleMemoryCompression", () => {
  const mockCreate = vi.fn();
  const saveLongTermMemory = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(llm).mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as any);
  });

  it("does nothing when fewer than 20 messages exist", async () => {
    vi.mocked(redis.lRange).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) =>
        JSON.stringify({ role: "user", content: `msg ${i}`, timestamp: i }),
      ),
    );

    await handleMemoryCompression("sess-x", saveLongTermMemory);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(saveLongTermMemory).not.toHaveBeenCalled();
  });

  it("summarizes and saves memory when 20+ messages exist", async () => {
    vi.mocked(redis.lRange).mockResolvedValue(
      Array.from({ length: 20 }, (_, i) =>
        JSON.stringify({ role: "user", content: `msg ${i}`, timestamp: i }),
      ),
    );

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "Summary of convo" } }],
    });

    await handleMemoryCompression("sess-y", saveLongTermMemory);

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(saveLongTermMemory).toHaveBeenCalledWith("Summary of convo");
    expect(vi.mocked(redis.lTrim)).toHaveBeenCalledWith("stm:sess-y", -5, -1);
  });

  it("uses exactly 20 as the threshold boundary", async () => {
    vi.mocked(redis.lRange).mockResolvedValue(
      Array.from({ length: 19 }, (_, i) =>
        JSON.stringify({ role: "user", content: `m${i}`, timestamp: i }),
      ),
    );

    await handleMemoryCompression("sess-boundary", saveLongTermMemory);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
