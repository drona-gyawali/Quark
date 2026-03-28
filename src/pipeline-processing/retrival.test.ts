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
  EmbedRequestInputType: { Query: "query", Document: "document" },
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
import { generateEmbedding, mem0Search, mem0Add } from "./utils.ts";
import { logger } from "../conf/logger.ts";

const makeRetrieval = (overrides = {}): any => ({
  message: "What is gradient descent?",
  sessionId: "sess-123",
  filters: { institution: "MIT", mode: "study", courseName: "6.006" },
  ...overrides,
});

const makeMem0Search = (): any => ({
  message: "What is gradient descent?",
  userId: "user-1",
});

const makeMem0Add = (): any => ({
  message: "What is gradient descent?",
  response: "It is an optimization algorithm.",
  userId: "user-1",
  query: "gradient descent",
});

const QUERY_VECTOR = Array.from({ length: 1024 }, () => 0.1);

const makeTopCandidates = (score = 0.9) => [
  {
    text: "Gradient descent minimizes loss",
    score,
    page: 1,
    isVisual: false,
    imageUrl: null,
  },
  {
    text: "Learning rate controls step size",
    score: score - 0.1,
    page: 2,
    isVisual: false,
    imageUrl: null,
  },
];

const setupHappyPath = (score = 0.9) => {
  vi.mocked(getSTM).mockResolvedValue([
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
  ] as any);
  vi.mocked(mem0Search).mockResolvedValue(["past memory context"]);
  vi.mocked(generateEmbedding).mockResolvedValue(QUERY_VECTOR);
  vi.mocked(getRelevantContext).mockResolvedValue(
    makeTopCandidates(score) as any,
  );
  vi.mocked(stmContext).mockReturnValue("user: hi\nassistant: hello");
  vi.mocked(contextString).mockReturnValue("[Source 1] Gradient descent...");
  vi.mocked(Response).mockReturnValue("Final prompt for LLM");
  vi.mocked(llmResponse).mockResolvedValue(
    "Gradient descent is an optimization algorithm.",
  );
  vi.mocked(addSTMMessage).mockResolvedValue(undefined as any);
  vi.mocked(handleMemoryCompression).mockResolvedValue(undefined);
};

describe("retriveContext", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns answer and sources on happy path", async () => {
    setupHappyPath();
    const result = await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    );

    expect(result.answer).toBe(
      "Gradient descent is an optimization algorithm.",
    );
    expect(result.sources).toEqual([]);
  });

  it("returns fallback answer when no candidates found", async () => {
    setupHappyPath();
    vi.mocked(getRelevantContext).mockResolvedValue([]);

    const result = await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    );
    expect(result.answer).toContain("could not find any relevant notes");
    expect(result.sources).toEqual([]);
  });

  it("returns fallback when top candidate score is below SIMILARITY_THRESHOLD", async () => {
    setupHappyPath(0.3); // below 0.5 threshold

    const result = await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    );
    expect(result.answer).toContain("could not find any relevant notes");
  });

  it("returns fallback when top candidate score is exactly at threshold boundary (< not <=)", async () => {
    setupHappyPath(0.5); // equal to threshold — should still pass (0.5 < 0.5 is false)

    const result = await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    );
    expect(result.answer).toBe(
      "Gradient descent is an optimization algorithm.",
    );
  });

  it("treats missing score as 0 (uses ?? 0)", async () => {
    vi.mocked(getSTM).mockResolvedValue([]);
    vi.mocked(mem0Search).mockResolvedValue([]);
    vi.mocked(generateEmbedding).mockResolvedValue(QUERY_VECTOR);
    vi.mocked(getRelevantContext).mockResolvedValue([
      {
        text: "doc",
        score: undefined,
        page: 1,
        isVisual: false,
        imageUrl: null,
      },
    ] as any);

    const result = await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    );
    expect(result.answer).toContain("could not find any relevant notes");
  });

  it("calls getSTM with the sessionId", async () => {
    setupHappyPath();
    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());
    expect(getSTM).toHaveBeenCalledWith("sess-123");
  });

  it("falls back to empty string sessionId when sessionId is undefined", async () => {
    setupHappyPath();
    await retriveContext(
      makeRetrieval({ sessionId: undefined }),
      makeMem0Search(),
      makeMem0Add(),
    );
    expect(getSTM).toHaveBeenCalledWith("");
  });

  it("calls mem0Search with the _mem0Search param", async () => {
    setupHappyPath();
    const search = makeMem0Search();
    await retriveContext(makeRetrieval(), search, makeMem0Add());
    expect(mem0Search).toHaveBeenCalledWith(search);
  });

  it("calls generateEmbedding with the message and Query input type", async () => {
    setupHappyPath();
    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());
    expect(generateEmbedding).toHaveBeenCalledWith(
      "What is gradient descent?",
      "query",
    );
  });

  it("calls getRelevantContext with correct params", async () => {
    setupHappyPath();
    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());
    expect(getRelevantContext).toHaveBeenCalledWith(
      { institution: "MIT", mode: "study", courseName: "6.006" },
      "test-collection",
      "What is gradient descent?",
      QUERY_VECTOR,
      5,
    );
  });

  it("passes stmContext + contextMemory + contextString combined to Response", async () => {
    setupHappyPath();
    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());

    const responseCall = vi.mocked(Response).mock.calls[0];
    const combinedContext = responseCall[0];

    expect(combinedContext).toContain("user: hi\nassistant: hello");
    expect(combinedContext).toContain("[Source 1] Gradient descent...");
  });

  it("calls llmResponse with the final prompt from Response()", async () => {
    setupHappyPath();
    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());
    expect(llmResponse).toHaveBeenCalledWith(undefined, "Final prompt for LLM");
  });

  it("calls Response with filters and message", async () => {
    setupHappyPath();
    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());
    expect(Response).toHaveBeenCalledWith(
      expect.any(String),
      { institution: "MIT", mode: "study", courseName: "6.006" },
      "What is gradient descent?",
    );
  });

  it("fires addSTMMessage for user message after getting answer", async () => {
    setupHappyPath();
    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());

    // Give fire-and-forget microtasks a chance to run
    await vi.waitFor(() => {
      expect(addSTMMessage).toHaveBeenCalledWith("sess-123", {
        role: "user",
        content: "What is gradient descent?",
      });
    });
  });

  it("fires addSTMMessage for assistant answer after getting answer", async () => {
    setupHappyPath();
    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());

    await vi.waitFor(() => {
      expect(addSTMMessage).toHaveBeenCalledWith("sess-123", {
        role: "assistant",
        content: "Gradient descent is an optimization algorithm.",
      });
    });
  });

  it("uses empty string sessionId for STM when sessionId is undefined", async () => {
    setupHappyPath();
    await retriveContext(
      makeRetrieval({ sessionId: undefined }),
      makeMem0Search(),
      makeMem0Add(),
    );

    await vi.waitFor(() => {
      const calls = vi.mocked(addSTMMessage).mock.calls;
      expect(calls.every(([id]) => id === "")).toBe(true);
    });
  });

  it("fires handleMemoryCompression with sessionId", async () => {
    setupHappyPath();
    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());

    await vi.waitFor(() => {
      expect(handleMemoryCompression).toHaveBeenCalledWith(
        "sess-123",
        expect.any(Function),
      );
    });
  });

  it("does NOT call llmResponse when no relevant candidates found", async () => {
    setupHappyPath();
    vi.mocked(getRelevantContext).mockResolvedValue([]);

    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());
    expect(llmResponse).not.toHaveBeenCalled();
  });

  it("does NOT call addSTMMessage when no relevant candidates found", async () => {
    setupHappyPath();
    vi.mocked(getRelevantContext).mockResolvedValue([]);

    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());
    await Promise.resolve();
    expect(addSTMMessage).not.toHaveBeenCalled();
  });

  // ── mem0Add inside handleMemoryCompression callback ──────────────────────────

  it("handleMemoryCompression callback calls mem0Add with summary and _mem0Add fields", async () => {
    setupHappyPath();

    // Capture and immediately invoke the callback passed to handleMemoryCompression
    vi.mocked(handleMemoryCompression).mockImplementation(
      async (_sessionId, callback) => {
        await callback("This is a summary of the conversation");
      },
    );
    vi.mocked(mem0Add).mockResolvedValue(true);

    const mem0AddPayload = makeMem0Add();
    await retriveContext(makeRetrieval(), makeMem0Search(), mem0AddPayload);

    await vi.waitFor(() => {
      expect(mem0Add).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mem0AddPayload,
          messages: [
            {
              role: "system",
              content: "This is a summary of the conversation",
            },
          ],
        }),
      );
    });
  });

  it("handleMemoryCompression callback logs error when mem0Add fails", async () => {
    setupHappyPath();

    vi.mocked(handleMemoryCompression).mockImplementation(
      async (_sessionId, callback) => {
        await callback("summary text");
      },
    );
    vi.mocked(mem0Add).mockRejectedValue(new Error("ltm write failed"));

    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to save LTM summary"),
        expect.anything(),
      );
    });
  });

  it("throws RetrivalExecption when getSTM fails", async () => {
    vi.mocked(getSTM).mockRejectedValue(new Error("redis down"));
    vi.mocked(mem0Search).mockResolvedValue([]);
    vi.mocked(generateEmbedding).mockResolvedValue(QUERY_VECTOR);

    await expect(
      retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add()),
    ).rejects.toThrow("Error while processing retrieval layer");
  });

  it("throws RetrivalExecption when generateEmbedding fails", async () => {
    vi.mocked(getSTM).mockResolvedValue([]);
    vi.mocked(mem0Search).mockResolvedValue([]);
    vi.mocked(generateEmbedding).mockRejectedValue(new Error("embed failed"));

    await expect(
      retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add()),
    ).rejects.toThrow("Error while processing retrieval layer");
  });

  it("throws RetrivalExecption when getRelevantContext fails", async () => {
    vi.mocked(getSTM).mockResolvedValue([]);
    vi.mocked(mem0Search).mockResolvedValue([]);
    vi.mocked(generateEmbedding).mockResolvedValue(QUERY_VECTOR);
    vi.mocked(getRelevantContext).mockRejectedValue(new Error("qdrant error"));

    await expect(
      retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add()),
    ).rejects.toThrow("Error while processing retrieval layer");
  });

  it("throws RetrivalExecption when llmResponse fails", async () => {
    setupHappyPath();
    vi.mocked(llmResponse).mockRejectedValue(new Error("llm timeout"));

    await expect(
      retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add()),
    ).rejects.toThrow("Error while processing retrieval layer");
  });

  it("thrown error is a RetrivalExecption not a raw Error", async () => {
    vi.mocked(getSTM).mockRejectedValue(new Error("boom"));
    vi.mocked(mem0Search).mockResolvedValue([]);
    vi.mocked(generateEmbedding).mockResolvedValue(QUERY_VECTOR);

    const err = await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    ).catch((e) => e);

    expect(err.name).toBe("RetrivalExecption");
  });

  it("includes the original error message inside RetrivalExecption", async () => {
    vi.mocked(getSTM).mockRejectedValue(new Error("very specific redis error"));
    vi.mocked(mem0Search).mockResolvedValue([]);
    vi.mocked(generateEmbedding).mockResolvedValue(QUERY_VECTOR);

    const err = await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    ).catch((e) => e);

    expect(err.message).toContain("very specific redis error");
  });

  it("logs error when retrieval fails", async () => {
    vi.mocked(getSTM).mockRejectedValue(new Error("fail"));
    vi.mocked(mem0Search).mockResolvedValue([]);
    vi.mocked(generateEmbedding).mockResolvedValue(QUERY_VECTOR);

    await retriveContext(
      makeRetrieval(),
      makeMem0Search(),
      makeMem0Add(),
    ).catch(() => {});
    expect(logger.error).toHaveBeenCalled();
  });

  it("does not throw when addSTMMessage rejects (fire-and-forget)", async () => {
    setupHappyPath();
    vi.mocked(addSTMMessage).mockRejectedValue(new Error("stm write failed"));

    await expect(
      retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add()),
    ).resolves.toBeDefined();
  });

  it("logs error when addSTMMessage rejects", async () => {
    setupHappyPath();
    vi.mocked(addSTMMessage).mockRejectedValue(new Error("stm write failed"));

    await retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add());

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to store"),
      );
    });
  });

  it("does not throw when handleMemoryCompression rejects (fire-and-forget)", async () => {
    setupHappyPath();
    vi.mocked(handleMemoryCompression).mockRejectedValue(
      new Error("compression failed"),
    );

    await expect(
      retriveContext(makeRetrieval(), makeMem0Search(), makeMem0Add()),
    ).resolves.toBeDefined();
  });
});
