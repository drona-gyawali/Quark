import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../conf/conf.ts", () => ({
  unstructured: vi.fn(),
  env: {
    LLM_MODEL: "gpt-4o",
    EMBEDDING_MODEL: "voyage-3",
    COLLECTION_NAME: "test-collection",
  },
  embedding: vi.fn(),
  memoClient: {
    search: vi.fn(),
    add: vi.fn(),
  },
}));

vi.mock("./consts.ts", () => ({
  MAXCHAR: 1000,
  BATCHSIZE: 2,
  limit: vi.fn((fn: () => any) => fn()),
  mem0Limit: 5,
}));

vi.mock("./exec.ts", () => ({
  PipelineException: class PipelineException extends Error {},
  RetrivalExecption: class RetrivalExecption extends Error {},
}));

vi.mock("./helpers.ts", () => ({
  getStaticPrompt: vi.fn((t) => `PROMPT_${t}`),
  isBase64: vi.fn(),
  nonStreamLLM: vi.fn(async () => "mocked visual description"),
  htmlTableToMarkdown: vi.fn(async () => "| table |"),
  prepareBatchRecords: vi.fn((els, vecs, start) =>
    els.map((_, i) => ({
      id: `id-${start + i}`,
      vector: vecs[i],
    })),
  ),
  sleep: vi.fn(),
  isDocumentElement: vi.fn(() => true),
}));

vi.mock("./vector-db.ts", () => ({
  dumpToDb: vi.fn(),
  ensureCollectionExists: vi.fn(),
}));

vi.mock("../conf/logger.ts", () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

/* ---------------- IMPORTS ---------------- */

import { describeVisualElements, reRank, mem0Search, mem0Add } from "./utils";

import { memoClient, embedding } from "../conf/conf";
import { nonStreamLLM, htmlTableToMarkdown, getStaticPrompt } from "./helpers";

/* ---------------- HELPERS ---------------- */

const makeImg = () => "iVBORw0KGgoAAA";

/* =====================================================
   describeVisualElements
===================================================== */

describe("describeVisualElements", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls LLM when image_base64 exists", async () => {
    const elements = [
      {
        type: "Image",
        text: "hello",
        metadata: { image_base64: makeImg() },
      },
    ];

    const res = await describeVisualElements(elements as any);

    expect(nonStreamLLM).toHaveBeenCalledOnce();
    expect(res[0].text).toContain("Visual Analysis");
    expect(res[0].metadata.image_base64).toBe("");
    expect(res[0].metadata.visual_description).toBeDefined();
  });

  it("truncates visual_description", async () => {
    vi.mocked(nonStreamLLM).mockResolvedValueOnce("X".repeat(600));

    const elements = [
      {
        type: "Image",
        text: "",
        metadata: { image_base64: makeImg() },
      },
    ];

    const res = await describeVisualElements(elements as any);

    expect(res[0].metadata.visual_description.length).toBe(500);
  });

  it("uses Table prompt", async () => {
    const elements = [
      {
        type: "Table",
        text: "",
        metadata: { image_base64: makeImg() },
      },
    ];

    await describeVisualElements(elements as any);

    expect(getStaticPrompt).toHaveBeenCalledWith("Table");
  });

  it("uses Image prompt", async () => {
    const elements = [
      {
        type: "Figure",
        text: "",
        metadata: { image_base64: makeImg() },
      },
    ];

    await describeVisualElements(elements as any);

    expect(getStaticPrompt).toHaveBeenCalledWith("Image");
  });

  it("converts HTML table", async () => {
    const elements = [
      {
        type: "Table",
        text: "",
        metadata: { text_as_html: "<table/>" },
      },
    ];

    const res = await describeVisualElements(elements as any);

    expect(htmlTableToMarkdown).toHaveBeenCalled();
    expect(res[0].text).toContain("Structured Table Data");
  });

  it("prefers image over HTML", async () => {
    const elements = [
      {
        type: "Table",
        text: "",
        metadata: {
          image_base64: makeImg(),
          text_as_html: "<table/>",
        },
      },
    ];

    await describeVisualElements(elements as any);

    expect(nonStreamLLM).toHaveBeenCalledOnce();
    expect(htmlTableToMarkdown).not.toHaveBeenCalled();
  });
});

/* =====================================================
   reRank
===================================================== */

describe("reRank", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls rerank correctly", async () => {
    const mock = vi.fn().mockResolvedValue("ok");

    vi.mocked(embedding).mockReturnValue({
      rerank: mock,
    } as any);

    const res = await reRank("q", ["a"]);

    expect(mock).toHaveBeenCalled();
    expect(res).toBe("ok");
  });
});

describe("mem0Search", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls search correctly", async () => {
    vi.mocked(memoClient.search).mockResolvedValue([] as any);

    await mem0Search({ message: "hi", userId: "u1" });

    expect(memoClient.search).toHaveBeenCalledWith("hi", {
      user_id: "u1",
      limit: 5,
    });
  });

  it("includes sessionId", async () => {
    vi.mocked(memoClient.search).mockResolvedValue([] as any);

    await mem0Search({
      message: "hi",
      userId: "u1",
      sessionId: "s1",
    });

    expect(memoClient.search).toHaveBeenCalledWith("hi", {
      user_id: "u1",
      sessionId: "s1",
      limit: 5,
    });
  });

  it("maps messages", async () => {
    vi.mocked(memoClient.search).mockResolvedValue([
      {
        memory: "yes",
        messages: [{ content: "a" }, { content: "b" }],
      },
    ] as any);

    const res = await mem0Search({
      message: "q",
      userId: "u",
    });

    expect(res[0]).toBe("a\nb");
  });
});

describe("mem0Add", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls add", async () => {
    vi.mocked(memoClient.add).mockResolvedValue(undefined as any);

    await mem0Add({
      message: "hi",
      response: "yo",
      userId: "u",
      query: "hi",
    });

    expect(memoClient.add).toHaveBeenCalled();
  });

  it("returns true", async () => {
    vi.mocked(memoClient.add).mockResolvedValue(undefined as any);

    const res = await mem0Add({
      message: "m",
      response: "r",
      userId: "u",
      query: "m",
    });

    expect(res).toBe(true);
  });
});
