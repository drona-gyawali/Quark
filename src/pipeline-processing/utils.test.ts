import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./conf.ts", () => ({
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
  limit: vi.fn((fn: () => any) => fn()), // passthrough concurrency limiter
  mem0Limit: 5,
}));

vi.mock("./exec.ts", () => ({
  PipelineException: class PipelineException extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "PipelineException";
    }
  },
  RetrivalExecption: class RetrivalExecption extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "RetrivalExecption";
    }
  },
}));

vi.mock("./helpers.ts", () => ({
  getStaticPrompt: vi.fn((type: string) => `PROMPT_FOR_${type}`),
  isBase64: vi.fn(() => true),
  llmResponse: vi.fn(async () => "mocked visual description"),
  prepareBatchRecords: vi.fn((elements, vectors, tags, start) =>
    elements.map((_: any, i: number) => ({
      id: `id-${start + i}`,
      vector: vectors[i],
    })),
  ),
  htmlTableToMarkdown: vi.fn(async () => "| col1 | col2 |\n|------|------|"),
  sleep: vi.fn(async () => {}),
  isDocumentElement: vi.fn(() => true),
}));

vi.mock("./vector-db.ts", () => ({
  dumpToDb: vi.fn(async () => {}),
  ensureCollectionExists: vi.fn(async () => {}),
}));

vi.mock("../conf/logger.ts", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("unstructured-client/sdk/models/shared", () => ({
  Strategy: { HiRes: "hi_res" },
}));

vi.mock("voyageai", () => ({
  EmbedRequestInputType: { Document: "document", Query: "query" },
}));

import {
  partitionDocument,
  describeVisualElements,
  generateEmbedding,
  processMetadata,
  visionMaker,
  reRank,
  mem0Search,
  mem0Add,
} from "./utils.ts";

import { unstructured, embedding, memoClient } from "./conf.ts";
import { dumpToDb, ensureCollectionExists } from "./vector-db.ts";
import {
  llmResponse,
  htmlTableToMarkdown,
  sleep,
  isDocumentElement,
} from "./helpers.ts";
import { EmbedRequestInputType } from "voyageai";

const makePngB64 = (len = 300) => "iVBORw0KGgo" + "A".repeat(len - 11);

const makeElement = (overrides = {}): any => ({
  element_id: "ele-001",
  type: "Text",
  text: "Sample text",
  metadata: { page_number: 1, filename: "test.pdf" },
  ...overrides,
});

describe("partitionDocument", () => {
  const mockPartition = vi.fn();

  beforeEach(() => {
    vi.mocked(unstructured).mockReturnValue({
      general: { partition: mockPartition },
    } as any);
  });

  afterEach(() => vi.clearAllMocks());

  it("calls unstructured with correct parameters", async () => {
    const fakeDoc = [{ type: "Text", text: "hello" }];
    mockPartition.mockResolvedValue(fakeDoc);

    const buf = Buffer.from("pdf bytes");
    const result = await partitionDocument(buf, "test.pdf");

    expect(mockPartition).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionParameters: expect.objectContaining({
          files: { content: buf, fileName: "test.pdf" },
          strategy: "hi_res",
          extractImageBlockTypes: ["Image", "Table", "Figure", "Graphic"],
        }),
      }),
    );
    expect(result).toBe(fakeDoc);
  });

  it("throws PipelineException when partition fails", async () => {
    mockPartition.mockRejectedValue(new Error("API down"));
    await expect(
      partitionDocument(Buffer.from("x"), "file.pdf"),
    ).rejects.toThrow("Error occured in Ingestion process");
  });
});

describe("describeVisualElements", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns elements unchanged when no image or table html", async () => {
    const elements = [makeElement()];
    const result = await describeVisualElements(elements);
    expect(result[0].text).toBe("Sample text");
    expect(llmResponse).not.toHaveBeenCalled();
  });

  it("calls llmResponse for elements with image_base64", async () => {
    const elements = [
      makeElement({
        type: "Image",
        metadata: { image_base64: makePngB64(), page_number: 1 },
      }),
    ];

    const result = await describeVisualElements(elements);

    expect(llmResponse).toHaveBeenCalledOnce();
    expect(result[0].text).toContain(
      "[Visual Analysis]: mocked visual description",
    );
    expect((result[0] as any).metadata.image_base64).toBe("");
    expect((result[0] as any).metadata.visual_description).toBeDefined();
  });

  it("truncates visual_description to 500 chars", async () => {
    vi.mocked(llmResponse).mockResolvedValueOnce("X".repeat(600));
    const elements = [
      makeElement({
        type: "Image",
        metadata: { image_base64: makePngB64(), page_number: 1 },
      }),
    ];

    const result = await describeVisualElements(elements);
    expect((result[0] as any).metadata.visual_description.length).toBe(500);
  });

  it("uses 'Table' prompt type when element type is Table", async () => {
    const { getStaticPrompt } = await import("./helpers.ts");
    const elements = [
      makeElement({
        type: "Table",
        metadata: { image_base64: makePngB64(), page_number: 1 },
      }),
    ];

    await describeVisualElements(elements);
    expect(getStaticPrompt).toHaveBeenCalledWith("Table");
  });

  it("uses 'Image' prompt type for non-Table visual elements", async () => {
    const { getStaticPrompt } = await import("./helpers.ts");
    const elements = [
      makeElement({
        type: "Figure",
        metadata: { image_base64: makePngB64(), page_number: 1 },
      }),
    ];

    await describeVisualElements(elements);
    expect(getStaticPrompt).toHaveBeenCalledWith("Image");
  });

  it("converts table HTML to markdown when text_as_html is present", async () => {
    const elements = [
      makeElement({
        type: "Table",
        metadata: {
          text_as_html: "<table><tr><td>A</td></tr></table>",
          page_number: 1,
        },
      }),
    ];

    const result = await describeVisualElements(elements);
    expect(htmlTableToMarkdown).toHaveBeenCalledOnce();
    expect(result[0].text).toContain("[Structured Table Data]");
    expect((result[0] as any).metadata.visual_description).toBe(
      "Table extracted via HTML-to-Markdown",
    );
  });

  it("falls back to original element if llmResponse throws", async () => {
    vi.mocked(llmResponse).mockRejectedValueOnce(new Error("vision fail"));
    const original = makeElement({
      type: "Image",
      metadata: { image_base64: makePngB64(), page_number: 1 },
    });

    const result = await describeVisualElements([original]);
    expect(result[0]).toEqual(original);
  });

  it("falls back to original element if htmlTableToMarkdown throws", async () => {
    vi.mocked(htmlTableToMarkdown).mockRejectedValueOnce(new Error("md fail"));
    const original = makeElement({
      type: "Table",
      metadata: { text_as_html: "<table/>", page_number: 1 },
    });

    const result = await describeVisualElements([original]);
    expect(result[0]).toEqual(original);
  });

  it("prefers image_base64 over text_as_html when both exist", async () => {
    const elements = [
      makeElement({
        type: "Table",
        metadata: {
          image_base64: makePngB64(),
          text_as_html: "<table/>",
          page_number: 1,
        },
      }),
    ];

    await describeVisualElements(elements);
    expect(llmResponse).toHaveBeenCalledOnce();
    expect(htmlTableToMarkdown).not.toHaveBeenCalled();
  });

  it("throws PipelineException on unexpected outer error", async () => {
    const { limit } = await import("./consts.ts");
    vi.mocked(limit).mockImplementationOnce(() => {
      throw new Error("unexpected");
    });

    await expect(describeVisualElements([makeElement()])).rejects.toThrow(
      "Visual processing failed",
    );
  });

  it("throws PipelineException when Promise.all itself throws (outer catch)", async () => {
    const { limit } = await import("./consts.ts");
    vi.mocked(limit).mockImplementationOnce(() => {
      throw new Error("unexpected outer failure");
    });
    await expect(describeVisualElements([makeElement()])).rejects.toThrow(
      "Visual processing failed",
    );
  });
});

describe("generateEmbedding", () => {
  const mockEmbed = vi.fn();

  beforeEach(() => {
    vi.mocked(embedding).mockReturnValue({
      embed: mockEmbed,
      rerank: vi.fn(),
    } as any);
  });

  afterEach(() => vi.clearAllMocks());

  it("returns a flat number[] for Query input type", async () => {
    mockEmbed.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });

    const result = await generateEmbedding(
      "what is AI?",
      EmbedRequestInputType.Query,
    );
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("returns number[][] for Document input type", async () => {
    mockEmbed.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
    });

    const result = await generateEmbedding(
      ["chunk 1", "chunk 2"],
      EmbedRequestInputType.Document,
    );
    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });

  it("wraps a single string into an array before embedding", async () => {
    mockEmbed.mockResolvedValue({ data: [{ embedding: [0.5] }] });

    await generateEmbedding("single input", EmbedRequestInputType.Document);
    const callArgs = mockEmbed.mock.calls[0][0];
    expect(Array.isArray(callArgs.input)).toBe(true);
    expect(callArgs.input).toEqual(["single input"]);
  });

  it("throws PipelineException when data length mismatches input length", async () => {
    mockEmbed.mockResolvedValue({ data: [{ embedding: [0.1] }] });

    await expect(
      generateEmbedding(["a", "b"], EmbedRequestInputType.Document),
    ).rejects.toThrow("Embedding generation mismatch with input chunks");
  });

  it("throws PipelineException when query embedding is missing", async () => {
    mockEmbed.mockResolvedValue({ data: [{ embedding: null }] });

    await expect(
      generateEmbedding("query", EmbedRequestInputType.Query),
    ).rejects.toThrow("Embedding generation failed with input query");
  });

  it("throws PipelineException when a document embedding is missing", async () => {
    mockEmbed.mockResolvedValue({
      data: [{ embedding: [0.1] }, { embedding: null }],
    });

    await expect(
      generateEmbedding(["a", "b"], EmbedRequestInputType.Document),
    ).rejects.toThrow("Missing embedding vector");
  });

  it("throws PipelineException when embed API call fails", async () => {
    mockEmbed.mockRejectedValue(new Error("network error"));

    await expect(
      generateEmbedding("test", EmbedRequestInputType.Query),
    ).rejects.toThrow("Error in Embedding Generation");
  });
});

describe("processMetadata", () => {
  const mockEmbed = vi.fn();
  const tags = { mode: "study", institution: "MIT", courseName: "6.001" };

  beforeEach(() => {
    vi.mocked(embedding).mockReturnValue({
      embed: mockEmbed,
      rerank: vi.fn(),
    } as any);
    vi.mocked(ensureCollectionExists).mockResolvedValue(undefined);
    vi.mocked(dumpToDb).mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("calls ensureCollectionExists with the collection name", async () => {
    mockEmbed.mockResolvedValue({ data: [{ embedding: [0.1] }] });
    await processMetadata([makeElement()], tags);
    expect(ensureCollectionExists).toHaveBeenCalledWith("test-collection");
  });

  it("processes elements in batches of BATCHSIZE", async () => {
    const elements = [makeElement(), makeElement({ element_id: "ele-002" })];
    mockEmbed.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
    });

    await processMetadata(elements, tags);
    expect(dumpToDb).toHaveBeenCalledOnce();
  });

  it("sleeps between batches when more batches remain", async () => {
    // BATCHSIZE=2, provide 3 elements → 2 batches → sleep called once
    const elements = [
      makeElement({ element_id: "a" }),
      makeElement({ element_id: "b" }),
      makeElement({ element_id: "c" }),
    ];

    mockEmbed
      .mockResolvedValueOnce({
        data: [{ embedding: [0.1] }, { embedding: [0.2] }],
      })
      .mockResolvedValueOnce({ data: [{ embedding: [0.3] }] });

    await processMetadata(elements, tags);
    expect(sleep).toHaveBeenCalledWith(21000);
  });

  it("does NOT sleep after the last batch", async () => {
    const elements = [makeElement()];
    mockEmbed.mockResolvedValue({ data: [{ embedding: [0.1] }] });

    await processMetadata(elements, tags);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("throws PipelineException when embedding count mismatches batch size", async () => {
    mockEmbed.mockResolvedValue({ data: [] }); // 0 embeddings for 1 element

    await expect(processMetadata([makeElement()], tags)).rejects.toThrow(
      "Error while processing metadata",
    );
  });

  it("returns { success: true } on completion", async () => {
    mockEmbed.mockResolvedValue({ data: [{ embedding: [0.1] }] });
    const result = await processMetadata([makeElement()], tags);
    expect(result).toEqual({ success: true });
  });
});

describe("visionMaker", () => {
  afterEach(() => vi.clearAllMocks());

  const baseElements = [
    {
      element_id: "e1",
      type: "CompositeElement",
      text: "page 1 text",
      metadata: { page_number: 1 },
    },
    {
      element_id: "e2",
      type: "Text",
      text: "page 2 text",
      metadata: { page_number: 2 },
    },
  ];

  it("assigns localImages to CompositeElement on matching page", () => {
    const localImages = { 1: [makePngB64()] };
    const result = visionMaker(baseElements as any, localImages, "doc.pdf");

    const composite = result.find((e) => e.element_id === "e1");
    expect((composite as any)?.metadata?.image_base64).toBeDefined();
  });

  it("does NOT assign image to non-CompositeElement", () => {
    const localImages = { 2: [makePngB64()] };
    const result = visionMaker(baseElements as any, localImages, "doc.pdf");

    const textEle = result.find((e) => e.element_id === "e2");
    expect((textEle as any)?.metadata?.image_base64).toBeUndefined();
  });

  it("pushes leftover images as new Image elements", () => {
    const localImages = { 3: [makePngB64(), makePngB64()] };
    const result = visionMaker(baseElements as any, localImages, "doc.pdf");

    const extras = result.filter((e) => e.element_id?.startsWith("manual-p3"));
    expect(extras).toHaveLength(2);
    expect(extras[0].type).toBe("Image");
    expect((extras[0] as any).metadata.filename).toBe("doc.pdf");
  });

  it("sorts output elements by page_number ascending", () => {
    const unordered = [
      {
        element_id: "e3",
        type: "Text",
        text: "p3",
        metadata: { page_number: 3 },
      },
      {
        element_id: "e1",
        type: "Text",
        text: "p1",
        metadata: { page_number: 1 },
      },
      {
        element_id: "e2",
        type: "Text",
        text: "p2",
        metadata: { page_number: 2 },
      },
    ];

    const result = visionMaker(unordered as any, {}, "doc.pdf");
    expect(result.map((e) => (e as any).metadata?.page_number)).toEqual([
      1, 2, 3,
    ]);
  });

  it("throws PipelineException when raw is a string", () => {
    vi.mocked(isDocumentElement).mockReturnValue(true);
    expect(() => visionMaker("not-an-array" as any, {}, "doc.pdf")).toThrow(
      "Unexpected string response from partition",
    );
  });

  it("throws PipelineException when raw is not an array", () => {
    expect(() => visionMaker({ foo: "bar" } as any, {}, "doc.pdf")).toThrow(
      "Partition did not return array of elements",
    );
  });

  it("throws PipelineException when elements fail isDocumentElement check", () => {
    vi.mocked(isDocumentElement).mockReturnValueOnce(false);
    expect(() =>
      visionMaker([{ bad: "element" }] as any, {}, "doc.pdf"),
    ).toThrow("Partition returned invalid element structure");
  });

  it("consumes images from localImages shift() (mutates array)", () => {
    const images = [makePngB64(), makePngB64()];
    const localImages = { 1: images };
    const elements = [
      {
        element_id: "a",
        type: "CompositeElement",
        text: "",
        metadata: { page_number: 1 },
      },
      {
        element_id: "b",
        type: "CompositeElement",
        text: "",
        metadata: { page_number: 1 },
      },
    ];

    const result = visionMaker(elements as any, localImages, "doc.pdf");
    const withImages = result.filter((e) => (e as any).metadata?.image_base64);
    expect(withImages).toHaveLength(2);
  });
});

describe("reRank", () => {
  const mockRerank = vi.fn();

  beforeEach(() => {
    vi.mocked(embedding).mockReturnValue({
      embed: vi.fn(),
      rerank: mockRerank,
    } as any);
  });

  afterEach(() => vi.clearAllMocks());

  it("calls rerank with correct parameters", async () => {
    const fakeResult = { results: [{ index: 0, relevance_score: 0.9 }] };
    mockRerank.mockResolvedValue(fakeResult);

    const result = await reRank("what is ML?", ["doc1", "doc2"]);

    expect(mockRerank).toHaveBeenCalledWith({
      query: "what is ML?",
      documents: ["doc1", "doc2"],
      model: "rerank-2",
      topK: 5,
    });
    expect(result).toBe(fakeResult);
  });

  it("throws PipelineException when rerank API fails", async () => {
    mockRerank.mockRejectedValue(new Error("rerank error"));

    await expect(reRank("query", ["doc"])).rejects.toThrow(
      "Reranking functionality has been crashed",
    );
  });
});

describe("mem0Search", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls memoClient.search with correct params (no sessionId)", async () => {
    vi.mocked(memoClient.search).mockResolvedValue([
      {
        memory: "remembered fact",
        messages: [
          { role: "user", content: "ctx line 1" },
          { role: "assistant", content: "ctx line 2" },
        ],
      },
    ] as any);

    await mem0Search({ message: "hello", userId: "user-1" });

    expect(memoClient.search).toHaveBeenCalledWith("hello", {
      user_id: "user-1",
      limit: 5,
    });
  });

  it("includes sessionId in search params when provided", async () => {
    vi.mocked(memoClient.search).mockResolvedValue([] as any);

    await mem0Search({ message: "hi", userId: "u1", sessionId: "sess-99" });

    expect(memoClient.search).toHaveBeenCalledWith("hi", {
      user_id: "u1",
      sessionId: "sess-99",
      limit: 5,
    });
  });

  it("maps results to joined message content when memory is truthy", async () => {
    vi.mocked(memoClient.search).mockResolvedValue([
      {
        memory: "some memory",
        messages: [
          { role: "user", content: "line A" },
          { role: "assistant", content: "line B" },
        ],
      },
    ] as any);

    const result = await mem0Search({ message: "recall", userId: "u1" });
    expect(result[0]).toBe("line A\nline B");
  });

  it("returns memory field directly when memory is falsy", async () => {
    vi.mocked(memoClient.search).mockResolvedValue([
      { memory: undefined, messages: [] },
    ] as any);

    const result = await mem0Search({ message: "recall", userId: "u1" });
    expect(result[0]).toBeUndefined();
  });

  it("throws RetrivalExecption when search fails", async () => {
    vi.mocked(memoClient.search).mockRejectedValue(
      new Error("search down") as any,
    );

    await expect(mem0Search({ message: "q", userId: "u1" })).rejects.toThrow(
      "Memory Agents failed while searching",
    );
  });
});

describe("mem0Add", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls memoClient.add with correct user and assistant messages", async () => {
    vi.mocked(memoClient.add).mockResolvedValue(undefined as any);

    await mem0Add({
      query: "hello",
      message: "hello",
      response: "hi there",
      userId: "u1",
    });

    expect(memoClient.add).toHaveBeenCalledWith(
      [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ],
      { user_id: "u1" },
    );
  });

  it("includes session_id when sessionId is provided", async () => {
    vi.mocked(memoClient.add).mockResolvedValue(undefined as any);

    await mem0Add({
      query: "msg",
      message: "msg",
      response: "resp",
      userId: "u2",
      sessionId: "sess-42",
    });

    expect(memoClient.add).toHaveBeenCalledWith(expect.any(Array), {
      user_id: "u2",
      session_id: "sess-42",
    });
  });

  it("returns true on success", async () => {
    vi.mocked(memoClient.add).mockResolvedValue(undefined as any);
    const result = await mem0Add({
      query: "m",
      message: "m",
      response: "r",
      userId: "u1",
    });
    expect(result).toBe(true);
  });

  it("throws RetrivalExecption when add fails", async () => {
    vi.mocked(memoClient.add).mockRejectedValue(new Error("add failed") as any);

    await expect(
      mem0Add({ query: "m", message: "m", response: "r", userId: "u1" }),
    ).rejects.toThrow("Memory Agents failed while adding");
  });
});
