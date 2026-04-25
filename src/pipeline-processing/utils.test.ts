import { describe, it, expect, vi, afterEach } from "vitest";

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

// ✅ FIX: mock getContentAccess which describeVisualElements calls internally
vi.mock("../service/object.ts", () => ({
  getContentAccess: vi.fn(async () => "https://signed-url.example.com"),
}));

/* =====================================================
   IMPORT AFTER MOCKS
===================================================== */

import {
  describeVisualElements,
  reRank,
  mem0Search,
  mem0Add,
} from "./utils.ts";

// ✅ FIX: import mocked helpers so we can spy on them
import {
  nonStreamLLM,
  getStaticPrompt,
  htmlTableToMarkdown,
} from "./helpers.ts";

// ✅ FIX: import mocked conf exports so vi.mocked() works on them
import { embedding, memoClient } from "../conf/conf.ts";

/* =====================================================
   HELPERS
===================================================== */

const makeImg = () => "s3-image-key";

const imageElement = () => ({
  type: "Image",
  element_id: "img-1",
  text: "hello",
  metadata: {
    image_url: makeImg(),
  },
});

const tableElement = () => ({
  type: "Table",
  element_id: "tbl-1",
  text: "",
  metadata: {
    image_url: makeImg(),
    text_as_html: "<table></table>",
  },
});

/* =====================================================
   describeVisualElements
===================================================== */

describe("describeVisualElements", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls LLM when image_url exists", async () => {
    // ✅ FIX: call without second DI arg; use imported mocked functions
    const res = await describeVisualElements([imageElement()] as any);

    expect(nonStreamLLM).toHaveBeenCalledOnce();
    expect(res[0].text).toContain("[Visual Analysis]");
    expect(res[0].metadata.visual_description).toBeDefined();
  });

  it("truncates visual_description", async () => {
    // ✅ FIX: use vi.mocked() on the imported mock
    vi.mocked(nonStreamLLM).mockResolvedValueOnce("X".repeat(600));

    const res = await describeVisualElements([imageElement()] as any);

    expect(res[0].metadata.visual_description.length).toBe(500);
  });

  it("uses Table prompt", async () => {
    await describeVisualElements([tableElement()] as any);

    expect(getStaticPrompt).toHaveBeenCalledWith("Table");
  });

  it("uses Image prompt", async () => {
    await describeVisualElements([imageElement()] as any);

    expect(getStaticPrompt).toHaveBeenCalledWith("Image");
  });

  it("converts HTML table", async () => {
    const res = await describeVisualElements([
      {
        type: "Table",
        element_id: "t1",
        text: "",
        metadata: {
          // no image_url so it falls through to HTML path
          text_as_html: "<table></table>",
        },
      },
    ] as any);

    expect(htmlTableToMarkdown).toHaveBeenCalled();
    expect(res[0].text).toContain("Structured Table Data");
  });

  it("prefers image over HTML", async () => {
    // tableElement has both image_url and text_as_html
    await describeVisualElements([tableElement()] as any);

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
    const rerankMock = vi.fn().mockResolvedValue("ok");

    // ✅ FIX: use vi.mocked() on the imported `embedding`
    vi.mocked(embedding).mockReturnValue({
      rerank: rerankMock,
    } as any);

    const res = await reRank("q", ["a"]);

    expect(rerankMock).toHaveBeenCalled();
    expect(res).toBe("ok");
  });
});

/* =====================================================
   mem0Search
===================================================== */

describe("mem0Search", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls search correctly", async () => {
    // ✅ FIX: use vi.mocked() on imported `memoClient`
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
