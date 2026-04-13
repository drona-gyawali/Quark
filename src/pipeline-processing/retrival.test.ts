import { describe, it, expect, vi, afterEach } from "vitest";

/* -------------------- mocks -------------------- */

vi.mock("./vector-db.ts", () => ({
  getRelevantContext: vi.fn(),
}));

vi.mock("./helpers.ts", () => ({
  llmResponse: vi.fn(),
  contextString: vi.fn(),
  Response: vi.fn(),
  getSTM: vi.fn(),
  addSTMMessage: vi.fn(),
  stmContext: vi.fn(),
}));

vi.mock("./utils.ts", () => ({
  generateEmbedding: vi.fn(),
  mem0Search: vi.fn(),
  streamCollector: vi.fn(),
}));

vi.mock("../shared/queue-config.ts", () => ({
  ChatQueue: {
    add: vi.fn(),
  },
}));

vi.mock("../conf/conf.ts", () => ({
  env: { COLLECTION_NAME: "test-collection" },
}));

vi.mock("./consts.ts", () => ({
  SIMILARITY_THRESHOLD: 0.5,
  VECTOR_LIMIT: 5,
}));

vi.mock("./exec.ts", () => ({
  RetrivalExecption: class RetrivalExecption extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "RetrivalExecption";
    }
  },
}));

vi.mock("../conf/logger.ts", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("voyageai", () => ({
  EmbedRequestInputType: { Query: "query" },
}));

/* -------------------- imports -------------------- */

import { retriveContext } from "./retrival.ts";
import { getRelevantContext } from "./vector-db.ts";
import {
  llmResponse,
  contextString,
  Response,
  getSTM,
  addSTMMessage,
  stmContext,
} from "./helpers.ts";

import { generateEmbedding, mem0Search, streamCollector } from "./utils.ts";

import { ChatQueue } from "../shared/queue-config.ts";
import { logger } from "../conf/logger.ts";

import type { ChatCompletionChunk } from "openai/resources";

/* -------------------- helpers -------------------- */

const drainStream = async (stream: AsyncIterable<any>) => {
  for await (const _ of stream) {
  }
};

const makeRetrieval = (overrides = {}): any => ({
  message: "What is gradient descent?",
  sessionId: "sess-123",
  ...overrides,
});

const makeMem0Search = (): any => ({
  message: "What is gradient descent?",
  userId: "user-1",
});

const makeMem0Add = (): any => ({
  userId: "user-1",
});

const QUERY_VECTOR = Array.from({ length: 10 }, () => 0.1);

const makeTopCandidates = (score = 0.9) => [
  { text: "doc1", score, page: 1, isVisual: false, imageUrl: null },
];

/* -------------------- setup -------------------- */

const setupHappyPath = (score = 0.9) => {
  vi.mocked(getSTM).mockResolvedValue([]);
  vi.mocked(mem0Search).mockResolvedValue(["memory"]);
  vi.mocked(generateEmbedding).mockResolvedValue(QUERY_VECTOR);
  vi.mocked(getRelevantContext).mockResolvedValue(
    makeTopCandidates(score) as any,
  );
  vi.mocked(stmContext).mockReturnValue("stm");
  vi.mocked(contextString).mockReturnValue("ctx");
  vi.mocked(Response).mockReturnValue("prompt");

  vi.mocked(llmResponse).mockResolvedValue("final answer");

  vi.mocked(addSTMMessage).mockResolvedValue(undefined as any);

  vi.mocked(streamCollector).mockImplementation(
    async function* (llmPromise, onFinish) {
      const finalText = await llmPromise;
      yield { choices: [{ delta: { content: finalText } }] } as any;
      await onFinish(finalText);
    },
  );
};

/* -------------------- tests -------------------- */

describe("retriveContext", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns stream and sources on happy path", async () => {
    setupHappyPath();

    const result = await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    );

    const chunks: string[] = [];

    for await (const chunk of result.stream as AsyncIterable<any>) {
      chunks.push(chunk.choices[0].delta?.content ?? "");
    }

    expect(chunks.join("")).toBe("final answer");
    expect(result.sources.length).toBe(1);
  });

  it("returns fallback when no candidates", async () => {
    setupHappyPath();
    vi.mocked(getRelevantContext).mockResolvedValue([]);

    const result = await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    );

    expect(result).toEqual({
      answer: "I could not find any relevant notes for your question.",
      sources: [],
    });
  });

  it("returns fallback when score below threshold", async () => {
    setupHappyPath(0.2);

    const result = await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    );

    expect(result.answer).toContain("could not find");
  });

  it("calls dependencies correctly", async () => {
    setupHappyPath();

    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());

    expect(getSTM).toHaveBeenCalled();
    expect(mem0Search).toHaveBeenCalled();
    expect(generateEmbedding).toHaveBeenCalled();
    expect(getRelevantContext).toHaveBeenCalled();
    expect(llmResponse).toHaveBeenCalled();
  });

  it("fires addSTMMessage (fire-and-forget)", async () => {
    setupHappyPath();

    const result = await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    );

    await drainStream(
      result.stream as AsyncGenerator<ChatCompletionChunk, void, unknown>,
    );

    await vi.waitFor(() => {
      expect(addSTMMessage).toHaveBeenCalledTimes(1);
    });
  });

  it("queues persistence job after stream completes", async () => {
    setupHappyPath();

    const result = await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    );

    for await (const _ of result.stream as AsyncIterable<any>) {
    }

    await new Promise((r) => setTimeout(r, 10));

    expect(ChatQueue.add).toHaveBeenCalledWith(
      "persist-chat",
      expect.objectContaining({
        sessionId: "sess-123",
        assistantMessage: "final answer",
        mem0Payload: expect.any(Object),
      }),
    );
  });
  it("does not throw when addSTMMessage fails", async () => {
    setupHappyPath();
    vi.mocked(addSTMMessage).mockRejectedValue(new Error("fail"));

    await expect(
      retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add()),
    ).resolves.toBeDefined();
  });

  it("does not throw when ChatQueue fails", async () => {
    setupHappyPath();
    vi.mocked(ChatQueue.add).mockRejectedValue(new Error("queue fail"));

    await expect(
      retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add()),
    ).resolves.toBeDefined();
  });

  it("throws RetrivalExecption on critical failure", async () => {
    vi.mocked(getSTM).mockRejectedValue(new Error("boom"));

    await expect(
      retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add()),
    ).rejects.toThrow("Error while processing retrieval layer");
  });

  it("logs error on failure", async () => {
    vi.mocked(getSTM).mockRejectedValue(new Error("boom"));

    await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    ).catch(() => {});

    expect(logger.error).toHaveBeenCalled();
  });
});
