import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../conf/conf.ts", () => ({
  vector: vi.fn(),
}));

vi.mock("./exec.ts", () => ({
  DatabaseExecption: class DatabaseExecption extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "DatabaseExecption";
    }
  },
}));

vi.mock("./utils.ts", () => ({
  reRank: vi.fn(),
}));

vi.mock("../conf/logger.ts", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  ensureCollectionExists,
  dumpToDb,
  getRelevantContext,
} from "./vector-db.ts";
import { vector } from "../conf/conf.ts";
import { reRank } from "./utils.ts";

const makeVectorClient = (overrides: Record<string, any> = {}) => ({
  getCollections: vi.fn(),
  createCollection: vi.fn(),
  upsert: vi.fn(),
  search: vi.fn(),
  ...overrides,
});

describe("ensureCollectionExists", () => {
  let client: ReturnType<typeof makeVectorClient>;

  beforeEach(() => {
    client = makeVectorClient();
    vi.mocked(vector).mockReturnValue(client as any);
  });

  afterEach(() => vi.clearAllMocks());

  it("does NOT create collection when it already exists", async () => {
    client.getCollections.mockResolvedValue({
      collections: [{ name: "my-col" }, { name: "other-col" }],
    });

    await ensureCollectionExists("my-col");

    expect(client.createCollection).not.toHaveBeenCalled();
  });

  it("creates collection with correct config when it does not exist", async () => {
    client.getCollections.mockResolvedValue({ collections: [] });
    client.createCollection.mockResolvedValue(undefined);

    await ensureCollectionExists("new-col");

    expect(client.createCollection).toHaveBeenCalledWith("new-col", {
      vectors: { size: 1024, distance: "Cosine" },
      optimizers_config: { default_segment_number: 2 },
    });
  });

  it("creates collection when collection list is non-empty but name is absent", async () => {
    client.getCollections.mockResolvedValue({
      collections: [{ name: "other" }],
    });
    client.createCollection.mockResolvedValue(undefined);

    await ensureCollectionExists("missing-col");

    expect(client.createCollection).toHaveBeenCalledOnce();
  });

  it("throws DatabaseExecption when getCollections fails", async () => {
    client.getCollections.mockRejectedValue(new Error("network error"));

    await expect(ensureCollectionExists("col")).rejects.toThrow(
      "Failed to ensure collection exists",
    );
  });

  it("throws DatabaseExecption when createCollection fails", async () => {
    client.getCollections.mockResolvedValue({ collections: [] });
    client.createCollection.mockRejectedValue(new Error("create failed"));

    await expect(ensureCollectionExists("col")).rejects.toThrow(
      "Failed to ensure collection exists",
    );
  });

  it("throws DatabaseExecption (not raw error) on any failure", async () => {
    client.getCollections.mockRejectedValue(new Error("boom"));

    const err = await ensureCollectionExists("col").catch((e) => e);
    expect(err.name).toBe("DatabaseExecption");
  });
});

describe("dumpToDb", () => {
  let client: ReturnType<typeof makeVectorClient>;

  beforeEach(() => {
    client = makeVectorClient();
    vi.mocked(vector).mockReturnValue(client as any);
  });

  afterEach(() => vi.clearAllMocks());

  const makeBatchRecords = (n = 2) =>
    Array.from({ length: n }, (_, i) => ({
      id: `id-${i}`,
      vector: [0.1 * i, 0.2 * i],
      text: `text ${i}`,
      metadata: { page_number: i + 1, isVisual: false },
    }));

  it("calls upsert with correct collection name", async () => {
    client.upsert.mockResolvedValue(undefined);
    await dumpToDb("my-col", makeBatchRecords());
    expect(client.upsert).toHaveBeenCalledWith("my-col", expect.any(Object));
  });

  it("upserts with wait:true", async () => {
    client.upsert.mockResolvedValue(undefined);
    await dumpToDb("col", makeBatchRecords());
    const callArg = client.upsert.mock.calls[0][1];
    expect(callArg.wait).toBe(true);
  });

  it("maps each record to correct point shape", async () => {
    client.upsert.mockResolvedValue(undefined);
    const records = makeBatchRecords(2);
    await dumpToDb("col", records);

    const points = client.upsert.mock.calls[0][1].points;
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({
      id: "id-0",
      vector: [0, 0],
      payload: { text: "text 0", page_number: 1, isVisual: false },
    });
  });

  it("spreads metadata into payload alongside text", async () => {
    client.upsert.mockResolvedValue(undefined);
    const records = [
      {
        id: "abc",
        vector: [1, 2, 3],
        text: "hello",
        metadata: { page_number: 5, filename: "doc.pdf", isVisual: true },
      },
    ];

    await dumpToDb("col", records);
    const payload = client.upsert.mock.calls[0][1].points[0].payload;
    expect(payload.text).toBe("hello");
    expect(payload.page_number).toBe(5);
    expect(payload.filename).toBe("doc.pdf");
    expect(payload.isVisual).toBe(true);
  });

  it("handles an empty batch without error", async () => {
    client.upsert.mockResolvedValue(undefined);
    await expect(dumpToDb("col", [])).resolves.toBeUndefined();
    expect(client.upsert.mock.calls[0][1].points).toHaveLength(0);
  });

  it("throws DatabaseExecption when upsert fails", async () => {
    client.upsert.mockRejectedValue(new Error("upsert error"));
    await expect(dumpToDb("col", makeBatchRecords())).rejects.toThrow(
      "Qdrant Upsert Failed",
    );
  });

  it("throws DatabaseExecption (not raw error) on failure", async () => {
    client.upsert.mockRejectedValue(new Error("boom"));
    const err = await dumpToDb("col", makeBatchRecords()).catch((e) => e);
    expect(err.name).toBe("DatabaseExecption");
  });
});

describe("getRelevantContext", () => {
  let client: ReturnType<typeof makeVectorClient>;

  const queryVector = Array.from({ length: 1024 }, () => 0.1);

  const makeSearchHits = () => [
    {
      score: 0.9,
      payload: {
        text: "doc one",
        page_number: 1,
        isVisual: false,
        image_url: null,
      },
    },
    {
      score: 0.8,
      payload: {
        text: "doc two",
        page_number: 2,
        isVisual: true,
        image_url: "https://example.com/img.png",
      },
    },
  ];

  const makeReRankResponse = () => ({
    data: [
      { index: 1, relevanceScore: 0.95 },
      { index: 0, relevanceScore: 0.75 },
    ],
  });

  beforeEach(() => {
    client = makeVectorClient();
    vi.mocked(vector).mockReturnValue(client as any);
  });

  afterEach(() => vi.clearAllMocks());

  it("calls vector().search with correct params", async () => {
    client.search.mockResolvedValue(makeSearchHits());
    vi.mocked(reRank).mockResolvedValue(makeReRankResponse() as any);

    await getRelevantContext("col", "what is ML?", queryVector, 5);

    expect(client.search).toHaveBeenCalledWith("col", {
      vector: queryVector,
      limit: 5,
      with_payload: true,
    });
  });

  it("passes extracted doc texts to reRank", async () => {
    client.search.mockResolvedValue(makeSearchHits());
    vi.mocked(reRank).mockResolvedValue(makeReRankResponse() as any);

    await getRelevantContext("col", "query", queryVector, 5);

    expect(reRank).toHaveBeenCalledWith("query", ["doc one", "doc two"]);
  });

  it("returns reranked results in rerank order", async () => {
    client.search.mockResolvedValue(makeSearchHits());
    vi.mocked(reRank).mockResolvedValue(makeReRankResponse() as any);

    const result = await getRelevantContext("col", "q", queryVector, 5);

    // rerank order: index 1 first, then index 0
    expect(result[0].text).toBe("doc two");
    expect(result[1].text).toBe("doc one");
  });

  it("replaces original score with rerank relevanceScore", async () => {
    client.search.mockResolvedValue(makeSearchHits());
    vi.mocked(reRank).mockResolvedValue(makeReRankResponse() as any);

    const result = await getRelevantContext("col", "q", queryVector, 5);

    expect(result[0].score).toBe(0.95);
    expect(result[1].score).toBe(0.75);
  });

  it("maps isVisual correctly from payload.isVisual", async () => {
    client.search.mockResolvedValue([
      { score: 0.9, payload: { text: "t", page_number: 1, isVisual: true } },
    ]);
    vi.mocked(reRank).mockResolvedValue({
      data: [{ index: 0, relevanceScore: 0.9 }],
    } as any);

    const result = await getRelevantContext("col", "q", queryVector, 1);
    expect(result[0].isVisual).toBe(true);
  });

  it("marks isVisual true when payload.type is 'Image'", async () => {
    client.search.mockResolvedValue([
      {
        score: 0.9,
        payload: { text: "t", page_number: 1, isVisual: false, type: "Image" },
      },
    ]);
    vi.mocked(reRank).mockResolvedValue({
      data: [{ index: 0, relevanceScore: 0.9 }],
    } as any);

    const result = await getRelevantContext("col", "q", queryVector, 1);
    expect(result[0].isVisual).toBe(true);
  });

  it("falls back to pageNumber when page_number is missing", async () => {
    client.search.mockResolvedValue([
      { score: 0.9, payload: { text: "t", pageNumber: 7 } },
    ]);
    vi.mocked(reRank).mockResolvedValue({
      data: [{ index: 0, relevanceScore: 0.8 }],
    } as any);

    const result = await getRelevantContext("col", "q", queryVector, 1);
    expect(result[0].page).toBe(7);
  });

  it("sets imageUrl to null when not present in payload", async () => {
    client.search.mockResolvedValue([
      { score: 0.9, payload: { text: "t", page_number: 1 } },
    ]);
    vi.mocked(reRank).mockResolvedValue({
      data: [{ index: 0, relevanceScore: 0.8 }],
    } as any);

    const result = await getRelevantContext("col", "q", queryVector, 1);
    expect(result[0].imageUrl).toBeNull();
  });

  it("throws DatabaseExecption when reRank returns no data", async () => {
    client.search.mockResolvedValue(makeSearchHits());
    vi.mocked(reRank).mockResolvedValue({ data: null } as any);

    await expect(
      getRelevantContext("col", "q", queryVector, 5),
    ).rejects.toThrow("Error occured while processing reranking startegy");
  });

  it("throws DatabaseExecption when reRank returns undefined", async () => {
    client.search.mockResolvedValue(makeSearchHits());
    vi.mocked(reRank).mockResolvedValue(undefined as any);

    await expect(
      getRelevantContext("col", "q", queryVector, 5),
    ).rejects.toThrow("Error occured while processing");
  });

  it("throws DatabaseExecption when vector search fails", async () => {
    client.search.mockRejectedValue(new Error("search failed"));

    await expect(
      getRelevantContext("col", "q", queryVector, 5),
    ).rejects.toThrow("Error occured while processing the response from db");
  });

  it("throws DatabaseExecption when reRank throws", async () => {
    client.search.mockResolvedValue(makeSearchHits());
    vi.mocked(reRank).mockRejectedValue(new Error("rerank crash"));

    await expect(
      getRelevantContext("col", "q", queryVector, 5),
    ).rejects.toThrow("Error occured while processing the response from db");
  });

  it("throws DatabaseExecption (not raw error) on any failure", async () => {
    client.search.mockRejectedValue(new Error("boom"));
    const err = await getRelevantContext("col", "q", queryVector, 5).catch(
      (e) => e,
    );
    expect(err.name).toBe("DatabaseExecption");
  });

  it("preserves all original doc fields in reranked output", async () => {
    client.search.mockResolvedValue([
      {
        score: 0.9,
        payload: {
          text: "important content",
          page_number: 3,
          isVisual: false,
          image_url: "https://s3.example.com/img.jpg",
        },
      },
    ]);
    vi.mocked(reRank).mockResolvedValue({
      data: [{ index: 0, relevanceScore: 0.99 }],
    } as any);

    const result = await getRelevantContext("col", "q", queryVector, 1);
    expect(result[0]).toMatchObject({
      text: "important content",
      page: 3,
      isVisual: false,
      imageUrl: "https://s3.example.com/img.jpg",
      score: 0.99,
    });
  });
});
