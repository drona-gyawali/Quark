import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./vector-db.ts", () => ({
  getRelevantContext: vi.fn(),
}));

vi.mock("./helpers.ts", () => ({
  llmResponse: vi.fn(),
  contextString: vi.fn(),
  Response: vi.fn(),
  getSTM: vi.fn(),
  addSTMMessage: vi.fn(),
  handleMemoryCompression: vi.fn(),
  stmContext: vi.fn(),
}));

vi.mock("./utils.ts", () => ({
  generateEmbedding: vi.fn(),
  mem0Search: vi.fn(),
  mem0Add: vi.fn(),
  streamCollector: vi.fn(),
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

import { retriveContext } from "./retrival.ts";
import { getRelevantContext } from "./vector-db.ts";
import {
  llmResponse,
  contextString,
  Response,
  getSTM,
  addSTMMessage,
  handleMemoryCompression,
  stmContext,
} from "./helpers.ts";
import {
  generateEmbedding,
  mem0Search,
  mem0Add,
  streamCollector,
} from "./utils.ts";
import { logger } from "../conf/logger.ts";

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

const QUERY_VECTOR = Array.from({ length: 1024 }, () => 0.1);

const makeTopCandidates = (score = 0.9) => [
  { text: "doc1", score, page: 1, isVisual: false, imageUrl: null },
];

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
  vi.mocked(handleMemoryCompression).mockResolvedValue(undefined);

  vi.mocked(streamCollector).mockImplementation(
    async (llmPromise, onComplete) => {
      const finalText = await llmPromise;
      if (onComplete) await onComplete(finalText);
      return finalText;
    },
  );
};

describe("retriveContext", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns stream and sources on happy path", async () => {
    setupHappyPath();

    const result = await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    );

    expect(await result.stream).toBe("final answer");
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
      answer: expect.stringContaining("could not find"),
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

    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());

    await vi.waitFor(() => {
      expect(addSTMMessage).toHaveBeenCalledTimes(2);
    });
  });

  it("fires handleMemoryCompression", async () => {
    setupHappyPath();

    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());

    await vi.waitFor(() => {
      expect(handleMemoryCompression).toHaveBeenCalled();
    });
  });

  it("mem0Add called inside compression callback", async () => {
    setupHappyPath();

    vi.mocked(handleMemoryCompression).mockImplementation(async (_id, cb) => {
      await cb("summary");
    });

    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());

    await vi.waitFor(() => {
      expect(mem0Add).toHaveBeenCalled();
    });
  });

  it("does not throw when addSTMMessage fails", async () => {
    setupHappyPath();
    vi.mocked(addSTMMessage).mockRejectedValue(new Error("fail"));

    await expect(
      retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add()),
    ).resolves.toBeDefined();
  });

  it("does not throw when handleMemoryCompression fails", async () => {
    setupHappyPath();
    vi.mocked(handleMemoryCompression).mockRejectedValue(new Error("fail"));

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
